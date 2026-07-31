'use strict';
const express  = require('express');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');

const router     = express.Router();
const ADMIN_ONLY = [requireAuth, requireRole('admin')];

// ── GET /api/audit-log ─────────────────────────────────────────────────────
// Query params: ?limit=50&offset=0&action=LOGIN&userId=<uuid>
router.get('/audit-log', ...ADMIN_ONLY, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || '100', 10), 500);
  const offset = parseInt(req.query.offset || '0',   10);

  let query = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (req.query.action) query = query.eq('action', req.query.action);
  if (req.query.userId) query = query.eq('user_id', req.query.userId);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ total: count, data });
});

// ── GET /api/login-history ─────────────────────────────────────────────────
// Query params: ?limit=50&offset=0&userId=<uuid>
router.get('/login-history', ...ADMIN_ONLY, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || '100', 10), 500);
  const offset = parseInt(req.query.offset || '0',   10);

  let query = supabase
    .from('login_history')
    .select(`
      id, login_time, logout_time, ip_address, browser, device, status,
      users ( id, name, email, role )
    `, { count: 'exact' })
    .order('login_time', { ascending: false })
    .range(offset, offset + limit - 1);

  if (req.query.userId) query = query.eq('user_id', req.query.userId);
  if (req.query.status) query = query.eq('status', req.query.status);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ total: count, data });
});

module.exports = router;
