'use strict';
const express  = require('express');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');

const router     = express.Router();
const ADMIN_ONLY = [requireAuth, requireRole('admin')];

// ── GET /api/settings/difficulty ──────────────────────────────────────────
router.get('/difficulty', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('settings')
    .select('value, updated_at, updated_by')
    .eq('key', 'difficulty')
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.json({ easy: 45, medium: 35, hard: 20 }); // fallback

  res.json({ ...data.value, updatedAt: data.updated_at });
});

// ── PUT /api/settings/difficulty ──────────────────────────────────────────
router.put('/difficulty', ...ADMIN_ONLY, async (req, res) => {
  const { easy, medium, hard } = req.body || {};

  if (
    typeof easy   !== 'number' || easy   < 0 ||
    typeof medium !== 'number' || medium < 0 ||
    typeof hard   !== 'number' || hard   < 0
  ) {
    return res.status(400).json({ error: 'easy, medium and hard must be non-negative numbers.' });
  }

  const total = easy + medium + hard;
  if (Math.abs(total - 100) > 0.01) {
    return res.status(400).json({
      error: `Percentages must sum to 100. Current sum: ${total}.`,
    });
  }

  const value = { easy: +easy.toFixed(1), medium: +medium.toFixed(1), hard: +hard.toFixed(1) };

  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'difficulty', value, updated_at: new Date().toISOString(), updated_by: req.user.userId });

  if (error) return res.status(400).json({ error: error.message });

  await writeAuditLog({
    userId: req.user.userId, userName: req.user.name,
    action: 'UPDATE_SETTINGS', resourceType: 'settings',
    resourceId: 'difficulty', details: value,
  });

  res.json({ message: 'Difficulty settings saved.', ...value });
});

module.exports = router;
