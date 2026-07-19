'use strict';
const { verifySocialToken } = require('../federation/verify');

async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = header.slice(7);
  try {
    const payload = await verifySocialToken(token);
    if (!payload.sub) {
      return res.status(401).json({ error: 'Invalid token structure.' });
    }
    req.user = { id: payload.sub };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = auth;
