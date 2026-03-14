'use strict';
const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Federation JWTs may use sub, id, userId, or user_id for the user's UUID.
    const userId = payload.id ?? payload.sub ?? payload.userId ?? payload.user_id;
    if (!userId) {
      console.error('JWT payload has no recognised user ID field. Keys present:', Object.keys(payload));
      return res.status(401).json({ error: 'Invalid token structure.' });
    }
    req.user = { id: userId };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = auth;
