'use strict';
const pool = require('../db');

const schema = `
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  CREATE TABLE IF NOT EXISTS friendships (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id  UUID        NOT NULL,
    addressee_id  UUID        NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_no_self_friend CHECK (requester_id <> addressee_id),
    CONSTRAINT uq_friendship_pair UNIQUE (requester_id, addressee_id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_pair ON friendships (
    LEAST(requester_id::text, addressee_id::text),
    GREATEST(requester_id::text, addressee_id::text)
  );

  CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships (addressee_id, status);
  CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships (requester_id, status);

  CREATE TABLE IF NOT EXISTS dm_conversations (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id_a  UUID        NOT NULL,
    user_id_b  UUID        NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_canonical_order CHECK (user_id_a < user_id_b),
    CONSTRAINT uq_dm_pair           UNIQUE (user_id_a, user_id_b)
  );

  CREATE TABLE IF NOT EXISTS dm_messages (
    id               BIGSERIAL   PRIMARY KEY,
    conversation_id  UUID        NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    sender_id        UUID        NOT NULL,
    content          TEXT        NOT NULL,
    is_edited        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    edited_at        TIMESTAMPTZ
  );

  CREATE INDEX IF NOT EXISTS idx_dm_messages_conv ON dm_messages (conversation_id, id DESC);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log('Database schema verified.');
  } finally {
    client.release();
  }
}

module.exports = migrate;
