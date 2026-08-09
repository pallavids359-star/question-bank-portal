'use strict';

const crypto = require('crypto');

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getJwtSecret() {
  const configured = String(process.env.JWT_SECRET || '').trim();
  if (configured.length >= 32) return configured;
  if (process.env.NODE_ENV === 'test') return 'test-only-jwt-secret-that-is-at-least-32-characters';
  if (configured) throw new Error('JWT_SECRET must contain at least 32 characters.');
  // Local development remains usable without silently deploying a known key.
  if (process.env.NODE_ENV !== 'production') {
    if (!global.__qbpDevelopmentJwtSecret) {
      global.__qbpDevelopmentJwtSecret = crypto.randomBytes(48).toString('base64url');
      console.warn('[security] JWT_SECRET is unset; using an ephemeral development key. Sessions will not survive restart.');
    }
    return global.__qbpDevelopmentJwtSecret;
  }
  return required('JWT_SECRET');
}

function allowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || '')
    .split(',').map(value => value.trim()).filter(Boolean);
}

module.exports = { required, getJwtSecret, allowedOrigins };
