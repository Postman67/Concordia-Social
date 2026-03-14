'use strict';
const { Router } = require('express');
const auth = require('../middleware/auth');
const db = require('../db');
const { getUserById, getUsersByIds } = require('../federation/client');
const { ensureConversation } = require('../helpers');

const FR_COOLDOWN_HOURS = 24;

module.exports = function friendsRouter(io) {
  const router = Router();

  // GET /api/friends — accepted friends with hydrated profiles
  router.get('/', auth, async (req, res) => {
    const userId = req.user.id;
    try {
      const { rows } = await db.query(
        `SELECT id, requester_id, addressee_id, updated_at AS since
         FROM friendships
         WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`,
        [userId]
      );
      const otherIds = rows.map((r) =>
        r.requester_id === userId ? r.addressee_id : r.requester_id
      );
      const profiles = await getUsersByIds(otherIds);
      res.json({
        friends: rows.map((r) => {
          const otherId = r.requester_id === userId ? r.addressee_id : r.requester_id;
          return { friendship_id: r.id, since: r.since, user: profiles[otherId] ?? { id: otherId } };
        }),
      });
    } catch (err) {
      console.error('GET /friends error:', err.message);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // GET /api/friends/incoming — pending requests sent to me
  router.get('/incoming', auth, async (req, res) => {
    const userId = req.user.id;
    try {
      const { rows } = await db.query(
        `SELECT id, requester_id, created_at AS sent_at
         FROM friendships
         WHERE addressee_id = $1 AND status = 'pending'`,
        [userId]
      );
      const profiles = await getUsersByIds(rows.map((r) => r.requester_id));
      res.json({
        requests: rows.map((r) => ({
          friendship_id: r.id,
          sent_at: r.sent_at,
          from: profiles[r.requester_id] ?? { id: r.requester_id },
        })),
      });
    } catch (err) {
      console.error('GET /friends/incoming error:', err.message);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // GET /api/friends/outgoing — pending requests I sent
  router.get('/outgoing', auth, async (req, res) => {
    const userId = req.user.id;
    try {
      const { rows } = await db.query(
        `SELECT id, addressee_id, created_at AS sent_at
         FROM friendships
         WHERE requester_id = $1 AND status = 'pending'`,
        [userId]
      );
      const profiles = await getUsersByIds(rows.map((r) => r.addressee_id));
      res.json({
        requests: rows.map((r) => ({
          friendship_id: r.id,
          sent_at: r.sent_at,
          to: profiles[r.addressee_id] ?? { id: r.addressee_id },
        })),
      });
    } catch (err) {
      console.error('GET /friends/outgoing error:', err.message);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // POST /api/friends/requests — send a friend request
  router.post('/requests', auth, async (req, res) => {
    const requesterId = req.user.id;
    const { addressee_id } = req.body;

    if (!addressee_id) return res.status(400).json({ error: '"addressee_id" is required.' });
    if (addressee_id === requesterId) return res.status(400).json({ error: 'You cannot friend yourself.' });

    // Confirm the target user exists on the Federation before touching our DB
    try {
      const target = await getUserById(addressee_id);
      if (!target) return res.status(404).json({ error: 'User not found.' });
    } catch {
      return res.status(502).json({ error: 'Could not reach the Federation.' });
    }

    try {
      // Check for any existing relationship in either direction
      const { rows: existing } = await db.query(
        `SELECT id, status, requester_id, updated_at
         FROM friendships
         WHERE (requester_id = $1 AND addressee_id = $2)
            OR (requester_id = $2 AND addressee_id = $1)`,
        [requesterId, addressee_id]
      );

      if (existing.length > 0) {
        const row = existing[0];

        if (row.status === 'accepted') {
          return res.status(409).json({ error: 'Already friends.' });
        }

        if (row.status === 'pending') {
          // If they already sent us a request, auto-accept it as a mutual FR
          if (row.requester_id === addressee_id) {
            await db.query(
              `UPDATE friendships SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
              [row.id]
            );
            await ensureConversation(requesterId, addressee_id);
            io.to(`user:${requesterId}`).emit('fr:accepted', { friendship_id: row.id });
            io.to(`user:${addressee_id}`).emit('fr:accepted', { friendship_id: row.id });
            return res.status(200).json({ message: 'Friend request accepted (mutual).' });
          }
          return res.status(409).json({ error: 'Friend request already pending.' });
        }

        if (row.status === 'declined') {
          const hoursSince = (Date.now() - new Date(row.updated_at).getTime()) / 3_600_000;
          if (hoursSince < FR_COOLDOWN_HOURS) {
            return res.status(429).json({ error: 'Please wait before sending another friend request to this user.' });
          }
          // Reset the existing row in-place (preserves DB constraints on the canonical pair)
          await db.query(
            `UPDATE friendships
             SET requester_id = $1, addressee_id = $2, status = 'pending', updated_at = NOW()
             WHERE id = $3`,
            [requesterId, addressee_id, row.id]
          );
          io.to(`user:${addressee_id}`).emit('fr:received', { friendship_id: row.id, from: { id: requesterId } });
          return res.status(201).json({ message: 'Friend request sent.' });
        }
      }

      // No prior relationship — insert fresh
      const { rows: [friendship] } = await db.query(
        `INSERT INTO friendships (requester_id, addressee_id)
         VALUES ($1, $2)
         RETURNING id`,
        [requesterId, addressee_id]
      );
      io.to(`user:${addressee_id}`).emit('fr:received', {
        friendship_id: friendship.id,
        from: { id: requesterId },
      });
      res.status(201).json({ message: 'Friend request sent.', friendship_id: friendship.id });
    } catch (err) {
      console.error('POST /friends/requests error:', err.message);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // PATCH /api/friends/requests/:id — accept or decline an incoming request
  router.patch('/requests/:id', auth, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { action } = req.body;

    if (action !== 'accept' && action !== 'decline') {
      return res.status(400).json({ error: '"action" must be "accept" or "decline".' });
    }

    try {
      const { rows } = await db.query(
        `SELECT id, requester_id, addressee_id, status FROM friendships WHERE id = $1`,
        [id]
      );
      const fr = rows[0];
      if (!fr) return res.status(404).json({ error: 'Friend request not found.' });
      if (fr.addressee_id !== userId) return res.status(403).json({ error: 'Not your request to respond to.' });
      if (fr.status !== 'pending') return res.status(409).json({ error: 'Request is no longer pending.' });

      const newStatus = action === 'accept' ? 'accepted' : 'declined';
      await db.query(
        `UPDATE friendships SET status = $1, updated_at = NOW() WHERE id = $2`,
        [newStatus, id]
      );

      if (newStatus === 'accepted') {
        await ensureConversation(fr.requester_id, fr.addressee_id);
        io.to(`user:${fr.requester_id}`).emit('fr:accepted', { friendship_id: fr.id });
      } else {
        io.to(`user:${fr.requester_id}`).emit('fr:declined', { friendship_id: fr.id });
      }

      res.json({ message: action === 'accept' ? 'Friend request accepted.' : 'Friend request declined.' });
    } catch (err) {
      console.error('PATCH /friends/requests/:id error:', err.message);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // DELETE /api/friends/:id — unfriend
  router.delete('/:id', auth, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    try {
      const { rows } = await db.query(
        `DELETE FROM friendships
         WHERE id = $1 AND status = 'accepted'
           AND (requester_id = $2 OR addressee_id = $2)
         RETURNING id`,
        [id, userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Friendship not found.' });
      res.status(204).send();
    } catch (err) {
      console.error('DELETE /friends/:id error:', err.message);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  return router;
};
