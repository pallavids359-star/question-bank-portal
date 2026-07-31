'use strict';
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'manchester-tech-question-bank-portal-super-secret-jwt-key-2026';

/**
 * Verify JWT in Authorization: Bearer <token> header.
 * Attaches decoded payload to req.user on success.
 */
function requireAuth(req, res, next) {

  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: no token provided.' });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized: token expired.' });
    }
    return res.status(401).json({ error: 'Unauthorized: invalid token.' });
  }
}

/**
 * Factory: returns middleware that allows only the listed roles.
 * Must be used AFTER requireAuth.
 *
 * Usage: requireRole('admin', 'adder')
 */
function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: requires one of [${roles.join(', ')}], but you are "${req.user.role}".`,
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
