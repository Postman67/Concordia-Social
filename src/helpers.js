'use strict';
const db = require('./db');

/**
 * Find or create the canonical 1:1 conversation between two users.
 * user_id_a is always the lexicographically smaller UUID so the UNIQUE
 * constraint on (user_id_a, user_id_b) guarantees at most one row per pair.
 * Returns the conversation ID.
 */
async function ensureConversation(userA, userB) {
  const a = userA < userB ? userA : userB;
  const b = userA < userB ? userB : userA;

  await db.query(
    `INSERT INTO dm_conversations (user_id_a, user_id_b)
     VALUES ($1, $2)
     ON CONFLICT (user_id_a, user_id_b) DO NOTHING`,
    [a, b]
  );

  const { rows } = await db.query(
    `SELECT id FROM dm_conversations WHERE user_id_a = $1 AND user_id_b = $2`,
    [a, b]
  );
  return rows[0].id;
}

module.exports = { ensureConversation };
