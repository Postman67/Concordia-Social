# Concordia-Social — Implementation Plan

> Last updated: March 7, 2026

This document describes what needs to exist before Concordia-Social can be built and deployed, and how the service will be structured once work begins.

---

## Prerequisites — outside of Concordia-Social

Before a single line of Social code runs in production, the following must be in place on other services.

### 1. Federation — Internal API

The Federation must have the internal API deployed and reachable. Based on the internal API spec, two endpoints are used by Social:

| Endpoint | Used for |
|---|---|
| `GET /api/internal/users/search?q=<prefix>` | Friend search by username |
| `GET /api/internal/users/:id` | Resolve a UUID to a public profile (display name, avatar, status) |

Both require the `X-Internal-Key` header. The Federation must be running a version that includes these routes before Social can call them.

### 2. Shared secret — `INTERNAL_API_KEY`

A single secret value must be generated and set on **both** services before Social makes its first call:

```
openssl rand -hex 32
```

Set the output as an environment variable on both Railway deployments:

| Service | Variable name | Value |
|---|---|---|
| Concordia-Federation | `INTERNAL_API_KEY` | *(shared secret)* |
| Concordia-Social | `INTERNAL_API_KEY` | *(same shared secret)* |

Social sends this value in every request to `/api/internal/*` as `X-Internal-Key`. Federation rejects any request where it doesn't match. The two deployments must be updated and redeployed at the same time when rotating the key.

This key is entirely separate from the Federation's `JWT_SECRET` and the admin `ADMIN_USER_ID`. It is not exposed to clients.

### 3. Concordia-Social Railway service

A new Railway service for Concordia-Social needs to be created. The minimum environment variables required to boot:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string for Social's own DB |
| `INTERNAL_API_KEY` | Shared secret for Federation internal calls |
| `FEDERATION_INTERNAL_URL` | Base URL of the Federation *on the internal Railway network* (e.g. `http://federation.railway.internal:3000`) |
| `JWT_SECRET` | Same value as Federation's `JWT_SECRET` — used to verify user JWTs locally without a round-trip |
| `PORT` | Set automatically by Railway |

> Using the Railway private network URL for `FEDERATION_INTERNAL_URL` keeps internal traffic off the public internet and avoids egress costs.

### 4. Database

Social needs its own PostgreSQL database provisioned in Railway (or equivalent). It does **not** share the Federation's database. The schema to be applied on first deploy:

```sql
-- Friend requests
CREATE TABLE friendships (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID        NOT NULL,
  addressee_id  UUID        NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | accepted | declined
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_no_self_friend CHECK (requester_id <> addressee_id),
  CONSTRAINT uq_friendship_pair UNIQUE (requester_id, addressee_id),
  CONSTRAINT uq_canonical_pair  UNIQUE (
    LEAST(requester_id::text, addressee_id::text),
    GREATEST(requester_id::text, addressee_id::text)
  )
);

CREATE INDEX idx_friendships_addressee ON friendships (addressee_id, status);
CREATE INDEX idx_friendships_requester ON friendships (requester_id, status);

-- 1:1 DM conversations
CREATE TABLE dm_conversations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_a  UUID        NOT NULL,  -- LEAST(a, b) — canonical ordering
  user_id_b  UUID        NOT NULL,  -- GREATEST(a, b)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_canonical_order CHECK (user_id_a < user_id_b),
  CONSTRAINT uq_dm_pair           UNIQUE (user_id_a, user_id_b)
);

-- DM messages
CREATE TABLE dm_messages (
  id               BIGSERIAL   PRIMARY KEY,
  conversation_id  UUID        NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_id        UUID        NOT NULL,
  content          TEXT        NOT NULL,
  is_edited        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  edited_at        TIMESTAMPTZ
);

CREATE INDEX idx_dm_messages_conv ON dm_messages (conversation_id, id DESC);
```

---

## How Social will work

### Authentication

Social does **not** have its own login system. Every client request carries the standard Federation JWT in the `Authorization: Bearer <token>` header, exactly as it does when talking to a Concordia Server.

Social verifies the JWT locally using the shared `JWT_SECRET`. No round-trip to the Federation is needed per request. The user's UUID is extracted directly from the verified token payload.

### Friend requests

1. Client searches for a user by typing a username prefix → Social calls `GET /api/internal/users/search?q=<prefix>` on the Federation and returns the results.
2. Client sends a FR → Social inserts a `pending` row into `friendships`. Before inserting, Social checks that no row already exists in either direction between the two users.
3. Addressee accepts → Social updates the row to `accepted`. A conversation row in `dm_conversations` is created at this point if one doesn't already exist for the pair.
4. Addressee declines → Social updates the row to `declined`. The row is retained; the requester cannot re-send until the cooldown period has passed.

### Direct messages

- Conversations are auto-created when a FR is accepted. A conversation can also be opened directly between any two users (the client can initiate one regardless of friendship status).
- Messages are delivered in real time over a WebSocket connection to the Social service.
- A user can edit or delete **only their own messages** (`sender_id = requesting_user`). There are no roles or elevated permissions in DMs.
- Pagination works the same way as Concordia Server channels: cursor-based on `id`, returning messages in chronological order.

### Profile data

Social stores only UUIDs. Whenever a response needs to include a display name, avatar, or status alongside a UUID (e.g. returning a friend list), Social calls `GET /api/internal/users/:id` on the Federation to resolve the profile fields at response time. These values are **not** cached or stored locally.

---

## Summary checklist

- [ ] Federation internal API deployed and accessible on the internal Railway network
- [ ] `INTERNAL_API_KEY` generated and set on both Federation and Social in Railway
- [ ] Concordia-Social Railway service created with all required env vars
- [ ] Social's PostgreSQL database provisioned and schema applied
- [ ] `FEDERATION_INTERNAL_URL` pointed at the Federation's private Railway URL
