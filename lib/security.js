'use strict';

const ROLE_PERMISSIONS = Object.freeze({
  admin: Object.freeze(['QUESTION_READ','QUESTION_CREATE','QUESTION_UPDATE','QUESTION_DELETE','USER_MANAGE','AUDIT_READ','SETTINGS_UPDATE']),
  adder: Object.freeze(['QUESTION_READ','QUESTION_CREATE','QUESTION_UPDATE','QUESTION_DELETE']),
  editor: Object.freeze(['QUESTION_READ','QUESTION_UPDATE']),
  viewer: Object.freeze(['QUESTION_READ']),
});

function hasPermission(role, permission) {
  return (ROLE_PERMISSIONS[String(role || '').toLowerCase()] || []).includes(permission);
}

function safeInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function createRateLimiter({ windowMs, max, key = req => req.ip || 'unknown' }) {
  const buckets = new Map();
  return function rateLimit(req, res, next) {
    const now = Date.now();
    const bucketKey = key(req);
    const current = buckets.get(bucketKey);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    bucket.count += 1;
    buckets.set(bucketKey, bucket);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    if (buckets.size > 10000) {
      for (const [entryKey, entry] of buckets) if (entry.resetAt <= now) buckets.delete(entryKey);
    }
    next();
  };
}

module.exports = { ROLE_PERMISSIONS, hasPermission, safeInteger, isUuid, createRateLimiter };
