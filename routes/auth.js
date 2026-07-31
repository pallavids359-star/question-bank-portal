'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');

const router       = express.Router();
const JWT_SECRET   = process.env.JWT_SECRET;
const JWT_EXPIRES  = process.env.JWT_EXPIRES_IN || '8h';

// ── helpers ────────────────────────────────────────────────────────────────

async function logLogin(userId, req, status) {
  const ua = req.headers['user-agent'] || '';
  const { data } = await supabase
    .from('login_history')
    .insert({
      user_id:    userId || null,
      ip_address: (req.ip || req.connection?.remoteAddress || '').substring(0, 100),
      browser:    ua.substring(0, 255),
      device:     /Mobile|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'Desktop',
      status,
    })
    .select('id')
    .single()
    .catch(() => ({ data: null }));
  return data;
}

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (error || !user) {
    await logLogin(null, req, 'failed');
    // Deliberate vague message to prevent user-enumeration
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (!user.is_active || user.status === 'disabled') {
    return res.status(403).json({ error: 'Your account has been disabled. Please contact an administrator.' });
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) {
    await logLogin(user.id, req, 'failed');
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Record successful login
  const loginRecord = await logLogin(user.id, req, 'success');

  // Update last_login timestamp
  await supabase
    .from('users')
    .update({ last_login: new Date().toISOString() })
    .eq('id', user.id);

  // Issue JWT
  if (!JWT_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET not set in .env' });
  }
  const payload = {
    userId:         user.id,
    email:          user.email,
    name:           user.name,
    role:           user.role,
    loginHistoryId: loginRecord?.id || null,
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

  await writeAuditLog({
    userId: user.id, userName: user.name,
    action: 'LOGIN', resourceType: 'auth',
    details: { ip: req.ip, device: /Mobile/i.test(req.headers['user-agent'] || '') ? 'Mobile' : 'Desktop' },
  });

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  if (req.user.loginHistoryId) {
    await supabase
      .from('login_history')
      .update({ logout_time: new Date().toISOString() })
      .eq('id', req.user.loginHistoryId)
      .catch(() => {});
  }

  await writeAuditLog({
    userId: req.user.userId, userName: req.user.name,
    action: 'LOGOUT', resourceType: 'auth', details: {},
  });

  res.json({ message: 'Logged out successfully.' });
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, email, role, status, last_login, created_at')
    .eq('id', req.user.userId)
    .maybeSingle();

  if (error || !user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  res.json(user);
});

// ── PUT /api/auth/change-password ─────────────────────────────────────────
router.put('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('password_hash')
    .eq('id', req.user.userId)
    .maybeSingle();

  if (error || !user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  const { error: updateError } = await supabase
    .from('users')
    .update({ password_hash: newHash })
    .eq('id', req.user.userId);

  if (updateError) {
    return res.status(500).json({ error: 'Failed to update password.' });
  }

  await writeAuditLog({
    userId: req.user.userId, userName: req.user.name,
    action: 'CHANGE_PASSWORD', resourceType: 'user',
    resourceId: req.user.userId, details: {},
  });

  res.json({ message: 'Password changed successfully.' });
});

module.exports = router;
