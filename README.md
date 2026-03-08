# Concordia-Social

Concordia-Social is the **friends and direct messaging service** for the [Concordia](https://github.com/Postman67/Concordia) network. It runs alongside the [Federation](https://github.com/Postman67/Concordia-Federation) and individual [Concordia Servers](https://github.com/Postman67/Concordia-Server), providing cross-server social features that don't belong to any single server instance.

---

## What it does

### Friends

- Search for any Concordia user by their Federation username.
- Send a friend request (FR) to another user.
- Accept or decline incoming friend requests.
- A friendship is always mutual — if A is friends with B, B is friends with A. There is no one-way follow model.
- A declined request is soft-retained to enforce a re-request cooldown.

### Direct Messages

- Start a 1:1 DM conversation with any Concordia user (friend or not).
- Send, edit, and delete your own messages.
- A user can **only** edit or delete their own messages — there are no elevated permissions or ownership roles in DMs.
- Message history is paginated (cursor-based, oldest-first), consistent with how Concordia Server channels work.
- Real-time delivery and typing indicators via WebSocket.

---

## What it does NOT do

- Server channels, roles, or permissions — those belong to individual Concordia Servers.
- Authentication — all identity is handled by the [Federation](https://github.com/Postman67/Concordia-Federation). Concordia-Social stores no passwords, emails, or display names; only Federation user UUIDs.

---

## Architecture

Concordia-Social is a standalone service with its own PostgreSQL database. It authenticates every request by validating the Federation JWT — the same token used for Concordia Servers.

```
Concordia Client
       │
       ▼
Concordia-Social  ──(JWT validation)──▶  Concordia Federation
       │
       ▼
  PostgreSQL DB
  (friendships, dm_conversations, dm_messages)
```

### Database tables

| Table | Purpose |
|---|---|
| `friendships` | Friend request lifecycle — `pending`, `accepted`, or `declined` |
| `dm_conversations` | One row per 1:1 conversation, keyed on the canonical user-pair |
| `dm_messages` | Message history, with edit and soft-delete support per author |

---

## Related repositories

| Repo | Description |
|---|---|
| [Concordia](https://github.com/Postman67/Concordia) | Marketing frontend |
| [Concordia-Federation](https://github.com/Postman67/Concordia-Federation) | Global identity — usernames, auth, server registry |
| [Concordia-Client](https://github.com/Postman67/Concordia-Client) | User-facing chat application |
| [Concordia-Server](https://github.com/Postman67/Concordia-Server) | Self-hostable server software |
