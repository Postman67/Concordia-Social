'use strict';
const jwt = require('jsonwebtoken');
const db = require('../db');

function setupSocket(io) {
  // Verify the Federation JWT on every socket connection
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required.'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = { id: payload.id };
      next();
    } catch {
      next(new Error('Invalid or expired token.'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;

    // Personal room — used for targeted events (fr:received, fr:accepted, fr:declined)
    socket.join(`user:${userId}`);

    // -------------------------------------------------------------------------
    // Conversation rooms
    // -------------------------------------------------------------------------

    socket.on('dm:join', async (conversationId) => {
      try {
        const { rows } = await db.query(
          `SELECT id FROM dm_conversations
           WHERE id = $1 AND (user_id_a = $2 OR user_id_b = $2)`,
          [conversationId, userId]
        );
        if (!rows.length) return socket.emit('error', { message: 'Conversation not found.' });
        socket.join(`conv:${conversationId}`);
        socket.emit('dm:joined', { conversationId });
      } catch (err) {
        console.error('dm:join error:', err.message);
        socket.emit('error', { message: 'Internal error.' });
      }
    });

    socket.on('dm:leave', (conversationId) => {
      socket.leave(`conv:${conversationId}`);
    });

    // -------------------------------------------------------------------------
    // Messaging
    // -------------------------------------------------------------------------

    socket.on('dm:send', async ({ conversationId, content }) => {
      if (!conversationId || !content?.trim()) {
        return socket.emit('error', { message: '"conversationId" and "content" are required.' });
      }
      if (content.length > 2000) {
        return socket.emit('error', { message: 'Message too long (max 2000 chars).' });
      }

      try {
        const { rows: convRows } = await db.query(
          `SELECT id FROM dm_conversations
           WHERE id = $1 AND (user_id_a = $2 OR user_id_b = $2)`,
          [conversationId, userId]
        );
        if (!convRows.length) return socket.emit('error', { message: 'Conversation not found.' });

        const { rows: [msg] } = await db.query(
          `INSERT INTO dm_messages (conversation_id, sender_id, content)
           VALUES ($1, $2, $3)
           RETURNING id, conversation_id, sender_id, content, is_edited, created_at`,
          [conversationId, userId, content.trim()]
        );
        io.to(`conv:${conversationId}`).emit('dm:new', msg);
      } catch (err) {
        console.error('dm:send error:', err.message);
        socket.emit('error', { message: 'Failed to send message.' });
      }
    });

    socket.on('dm:edit', async ({ messageId, content }) => {
      if (!messageId || !content?.trim()) {
        return socket.emit('error', { message: '"messageId" and "content" are required.' });
      }
      if (content.length > 2000) {
        return socket.emit('error', { message: 'Message too long (max 2000 chars).' });
      }

      try {
        const { rows } = await db.query(
          `UPDATE dm_messages
           SET content = $1, is_edited = TRUE, edited_at = NOW()
           WHERE id = $2 AND sender_id = $3
           RETURNING id, conversation_id, content, is_edited, edited_at`,
          [content.trim(), messageId, userId]
        );
        if (!rows.length) return socket.emit('error', { message: 'Message not found or not yours.' });
        const updated = rows[0];
        io.to(`conv:${updated.conversation_id}`).emit('dm:edited', updated);
      } catch (err) {
        console.error('dm:edit error:', err.message);
        socket.emit('error', { message: 'Failed to edit message.' });
      }
    });

    socket.on('dm:delete', async ({ messageId }) => {
      if (!messageId) return socket.emit('error', { message: '"messageId" is required.' });

      try {
        const { rows } = await db.query(
          `DELETE FROM dm_messages
           WHERE id = $1 AND sender_id = $2
           RETURNING id, conversation_id`,
          [messageId, userId]
        );
        if (!rows.length) return socket.emit('error', { message: 'Message not found or not yours.' });
        const deleted = rows[0];
        io.to(`conv:${deleted.conversation_id}`).emit('dm:deleted', {
          message_id: deleted.id,
          conversation_id: deleted.conversation_id,
        });
      } catch (err) {
        console.error('dm:delete error:', err.message);
        socket.emit('error', { message: 'Failed to delete message.' });
      }
    });

    // -------------------------------------------------------------------------
    // Typing indicators
    // -------------------------------------------------------------------------

    socket.on('typing:start', (conversationId) => {
      socket.to(`conv:${conversationId}`).emit('typing:update', {
        conversationId,
        user: { id: userId },
        isTyping: true,
      });
    });

    socket.on('typing:stop', (conversationId) => {
      socket.to(`conv:${conversationId}`).emit('typing:update', {
        conversationId,
        user: { id: userId },
        isTyping: false,
      });
    });
  });
}

module.exports = { setupSocket };
