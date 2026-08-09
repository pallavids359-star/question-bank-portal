'use strict';
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../lib/config');

/**
 * Verify JWT in Authorization: Bearer <token> header.
 * Attaches decoded payload to req.user on success.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: no token provided.' });
  }
  const token = header.slice(7).trim();
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: invalid token.' });
  }
}

/**
 * Factory: returns middleware that allows only the listed roles.
 * Must be used AFTER requireAuth.
 */
function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    const userRole = (req.user.role || '').toLowerCase();
    const allowed = roles.map(r => r.toLowerCase());
    if (!allowed.includes(userRole)) {
      return res.status(403).json({
        error: `Forbidden: requires one of [${roles.join(', ')}], but you are "${req.user.role}".`,
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
