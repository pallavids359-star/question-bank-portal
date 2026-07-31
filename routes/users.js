'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');

const router = express.Router();
const ADMIN_ONLY = [requireAuth, requireRole('admin')];

// ── GET /api/users ─────────────────────────────────────────────────────────
router.get('/', ...ADMIN_ONLY, async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, status, is_active, created_at, last_login')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch users.', details: error.message });
  }
  res.json(data);
});

// ── POST /api/users ────────────────────────────────────────────────────────
router.post('/', ...ADMIN_ONLY, async (req, res) => {
  const { name, email, password, role } = req.body || {};

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password and role are required.' });
  }
  if (!['adder', 'viewer', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin, adder, or viewer.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  // Check for duplicate email
  const { data: existing } = await supabase
    .from('users').select('id').eq('email', email.toLowerCase().trim()).maybeSingle();
  if (existing) {
    return res.status(409).json({ error: 'A user with that email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { data, error } = await supabase
    .from('users')
    .insert({
      name:          name.trim(),
      email:         email.toLowerCase().trim(),
      password_hash: passwordHash,
      role,
      status:        'active',
      is_active:     true,
    })
    .select('id, name, email, role, status, is_active, created_at')
    .single();

  if (error) {
    return res.status(400).json({ error: 'Failed to create user.', details: error.message });
  }

  await writeAuditLog({
    userId: req.user.userId, userName: req.user.name,
    action: 'CREATE_USER', resourceType: 'user',
    resourceId: data.id, details: { name: data.name, email: data.email, role },
  });

  res.status(201).json(data);
});

// ── GET /api/users/:id ────────────────────────────────────────────────────
router.get('/:id', ...ADMIN_ONLY, async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, status, is_active, created_at, last_login')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: 'User not found.' });
  res.json(data);
});

// ── PUT /api/users/:id ────────────────────────────────────────────────────
router.put('/:id', ...ADMIN_ONLY, async (req, res) => {
  const { name, email, role, status, is_active } = req.body || {};
  const update = {};

  if (name      !== undefined) update.name      = name.trim();
  if (email     !== undefined) update.email     = email.toLowerCase().trim();
  if (role      !== undefined) {
    if (!['admin','adder','viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }
    update.role = role;
  }
  if (status    !== undefined) update.status    = status;
  if (is_active !== undefined) update.is_active = Boolean(is_active);

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update.' });
  }

  const { data, error } = await supabase
    .from('users')
    .update(update)
    .eq('id', req.params.id)
    .select('id, name, email, role, status, is_active, created_at, last_login')
    .maybeSingle();

  if (error) return res.status(400).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: 'User not found.' });

  await writeAuditLog({
    userId: req.user.userId, userName: req.user.name,
    action: 'UPDATE_USER', resourceType: 'user',
    resourceId: req.params.id, details: update,
  });

  res.json(data);
});

// ── PUT /api/users/:id/reset-password ────────────────────────────────────
router.put('/:id/reset-password', ...ADMIN_ONLY, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'newPassword must be at least 6 characters.' });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  const { data, error } = await supabase
    .from('users')
    .update({ password_hash: hash })
    .eq('id', req.params.id)
    .select('id, name, email')
    .maybeSingle();

  if (error) return res.status(400).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: 'User not found.' });

  await writeAuditLog({
    userId: req.user.userId, userName: req.user.name,
    action: 'RESET_PASSWORD', resourceType: 'user',
    resourceId: req.params.id, details: { targetUser: data.name },
  });

  res.json({ message: `Password reset for ${data.name}.` });
});

// ── PUT /api/users/:id/role ──────────────────────────────────────────────
router.put('/:id/role', ...ADMIN_ONLY, async (req, res) => {
  const { role } = req.body || {};
  if (!['admin','adder','viewer'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin, adder, or viewer.' });
  }

  const { data, error } = await supabase
    .from('users')
    .update({ role })
    .eq('id', req.params.id)
    .select('id, name, role')
    .maybeSingle();

  if (error) return res.status(400).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: 'User not found.' });

  await writeAuditLog({
    userId: req.user.userId, userName: req.user.name,
    action: 'CHANGE_ROLE', resourceType: 'user',
    resourceId: req.params.id, details: { newRole: role, targetUser: data.name },
  });

  res.json(data);
});

// ── DELETE /api/users/:id ─────────────────────────────────────────────────
router.delete('/:id', ...ADMIN_ONLY, async (req, res) => {
  // Prevent self-deletion
  if (req.params.id === req.user.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  // Prevent deleting the last admin
  const { count: adminCount } = await supabase
    .from('users').select('*', { count: 'exact', head: true }).eq('role', 'admin');
  const { data: target } = await supabase
    .from('users').select('role, name').eq('id', req.params.id).maybeSingle();

  if (target?.role === 'admin' && adminCount <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last administrator account.' });
  }

  const { data, error } = await supabase
    .from('users').delete().eq('id', req.params.id).select('id').maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: 'User not found.' });

  await writeAuditLog({
    userId: req.user.userId, userName: req.user.name,
    action: 'DELETE_USER', resourceType: 'user',
    resourceId: req.params.id, details: { deletedUser: target?.name },
  });

  res.json({ success: true, deletedId: data.id });
});

module.exports = router;
