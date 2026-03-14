'use strict';
const { Router } = require('express');
const auth = require('../middleware/auth');
const { searchUsers } = require('../federation/client');

const router = Router();

// GET /api/users/search?q=<prefix>
router.get('/search', auth, async (req, res) => {
  const q = (req.query.q ?? '').trim();
  if (!q) return res.status(400).json({ error: 'Query parameter "q" is required.' });

  try {
    const data = await searchUsers(q);
    res.json(data);
  } catch (err) {
    console.error('User search error:', err.stack ?? err.message);
    res.status(502).json({ error: 'Could not reach the Federation.' });
  }
});

module.exports = router;
