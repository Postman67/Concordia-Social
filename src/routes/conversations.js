'use strict';
const { Router } = require('express');
const auth = require('../middleware/auth');
const db = require('../db');
const { getUserById, getUsersByIds } = require('../federation/client');
const { ensureConversation } = require('../helpers');

const router = Router();

// GET /api/conversations — list all conversations for the current user,
// ordered by most recently active first.
router.get('/', auth, async (req, res) => {
  const userId = req.user.id;
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.user_id_a, c.user_id_b, c.created_at,
              m.id         AS last_msg_id,
              m.content    AS last_msg_content,
              m.sender_id  AS last_msg_sender,
              m.created_at AS last_msg_at
       FROM dm_conversations c
       LEFT JOIN LATERAL (
         SELECT id, content, sender_id, created_at
         FROM dm_messages
         WHERE conversation_id = c.id
         ORDER BY id DESC
         LIMIT 1
       ) m ON true
       WHERE c.user_id_a = $1 OR c.user_id_b = $1
       ORDER BY COALESCE(m.created_at, c.created_at) DESC`,
      [userId]
    );

    const otherIds = rows.map((r) => (r.user_id_a === userId ? r.user_id_b : r.user_id_a));
    const profiles = await getUsersByIds(otherIds);

    res.json({
      conversations: rows.map((r) => {
        const otherId = r.user_id_a === userId ? r.user_id_b : r.user_id_a;
        return {
          id: r.id,
          with: profiles[otherId] ?? { id: otherId },
          last_message: r.last_msg_at
            ? {
                id: r.last_msg_id,
                content: r.last_msg_content,
                sender_id: r.last_msg_sender,
                sent_at: r.last_msg_at,
              }
            : null,
          created_at: r.created_at,
        };
      }),
    });
  } catch (err) {
    console.error('GET /conversations error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/conversations — open or retrieve the 1:1 DM with a given user.
// Idempotent — calling it multiple times always returns the same conversation.
router.post('/', auth, async (req, res) => {
  const userId = req.user.id;
  const { user_id } = req.body;

  if (!user_id) return res.status(400).json({ error: '"user_id" is required.' });
  if (user_id === userId) return res.status(400).json({ error: 'Cannot DM yourself.' });

  try {
    const convId = await ensureConversation(userId, user_id);
    const { rows } = await db.query(`SELECT * FROM dm_conversations WHERE id = $1`, [convId]);
    res.status(200).json({ conversation: rows[0] });
  } catch (err) {
    console.error('POST /conversations error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/conversations/:id — single conversation with other user's profile
router.get('/:id', auth, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      `SELECT * FROM dm_conversations WHERE id = $1 AND (user_id_a = $2 OR user_id_b = $2)`,
      [id, userId]
    );
    const conv = rows[0];
    if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

    const otherId = conv.user_id_a === userId ? conv.user_id_b : conv.user_id_a;
    const profile = await getUserById(otherId).catch(() => null);
    res.json({ conversation: { ...conv, with: profile ?? { id: otherId } } });
  } catch (err) {
    console.error('GET /conversations/:id error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/conversations/:id/messages — paginated message history,
// oldest-first. Supports ?limit and ?before=<messageId> for pagination.
router.get('/:id/messages', auth, async (req, res) => {
  const userId = req.user.id;
  const { id: convId } = req.params;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const before = req.query.before ? parseInt(req.query.before, 10) : null;

  try {
    // Verify the caller is a participant
    const { rows: convRows } = await db.query(
      `SELECT id FROM dm_conversations WHERE id = $1 AND (user_id_a = $2 OR user_id_b = $2)`,
      [convId, userId]
    );
    if (!convRows.length) return res.status(404).json({ error: 'Conversation not found.' });

    // Fetch N most-recent messages (or N older than cursor), return oldest-first
    let queryText;
    let params;
    if (before) {
      queryText = `
        SELECT * FROM (
          SELECT id, sender_id, content, is_edited, created_at, edited_at
          FROM dm_messages
          WHERE conversation_id = $1 AND id < $3
          ORDER BY id DESC LIMIT $2
        ) sub ORDER BY id ASC`;
      params = [convId, limit, before];
    } else {
      queryText = `
        SELECT * FROM (
          SELECT id, sender_id, content, is_edited, created_at, edited_at
          FROM dm_messages
          WHERE conversation_id = $1
          ORDER BY id DESC LIMIT $2
        ) sub ORDER BY id ASC`;
      params = [convId, limit];
    }

    const { rows } = await db.query(queryText, params);
    res.json({ messages: rows });
  } catch (err) {
    console.error('GET /conversations/:id/messages error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
