'use strict';
const { Router } = require('express');
const auth = require('../middleware/auth');
const db = require('../db');

module.exports = function messagesRouter(io) {
  const router = Router();

  // PATCH /api/messages/:id — edit your own message
  router.patch('/:id', auth, async (req, res) => {
    const userId = req.user.id;
    const msgId = parseInt(req.params.id, 10);
    const { content } = req.body;

    if (isNaN(msgId)) return res.status(400).json({ error: 'Invalid message ID.' });
    if (!content?.trim()) return res.status(400).json({ error: '"content" is required.' });
    if (content.length > 2000) return res.status(400).json({ error: 'Message too long (max 2000 chars).' });

    try {
      const { rows } = await db.query(
        `UPDATE dm_messages
         SET content = $1, is_edited = TRUE, edited_at = NOW()
         WHERE id = $2 AND sender_id = $3
         RETURNING id, conversation_id, content, is_edited, edited_at`,
        [content.trim(), msgId, userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Message not found or not yours.' });

      const updated = rows[0];
      io.to(`conv:${updated.conversation_id}`).emit('dm:edited', updated);
      res.json(updated);
    } catch (err) {
      console.error('PATCH /messages/:id error:', err.message);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // DELETE /api/messages/:id — delete your own message
  router.delete('/:id', auth, async (req, res) => {
    const userId = req.user.id;
    const msgId = parseInt(req.params.id, 10);

    if (isNaN(msgId)) return res.status(400).json({ error: 'Invalid message ID.' });

    try {
      const { rows } = await db.query(
        `DELETE FROM dm_messages
         WHERE id = $1 AND sender_id = $2
         RETURNING id, conversation_id`,
        [msgId, userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Message not found or not yours.' });

      const deleted = rows[0];
      io.to(`conv:${deleted.conversation_id}`).emit('dm:deleted', {
        message_id: deleted.id,
        conversation_id: deleted.conversation_id,
      });
      res.status(204).send();
    } catch (err) {
      console.error('DELETE /messages/:id error:', err.message);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  return router;
};
