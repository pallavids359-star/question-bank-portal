'use strict';
const express  = require('express');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');

const router = express.Router();

// ── field map: API camelCase ↔ DB snake_case ───────────────────────────────
const fieldMap = {
  subject:       'subject',
  klass:         'klass',
  chapter:       'chapter',
  topic:         'topic',
  exams:         'exams',
  qType:         'q_type',
  question:      'question',
  optA:          'opt_a',
  optB:          'opt_b',
  optC:          'opt_c',
  optD:          'opt_d',
  assertion:     'assertion',
  reason:        'reason',
  predefOptions: 'predef_options',
  columnA:       'column_a',
  columnB:       'column_b',
  matchOptions:  'match_options',
  numAnswer:     'num_answer',
  correctOption: 'correct_option',
  solutionText:  'solution_text',
};

function toDatabase(input) {
  return Object.entries(fieldMap).reduce((out, [apiField, dbField]) => {
    if (Object.prototype.hasOwnProperty.call(input, apiField)) {
      out[dbField] = input[apiField];
    }
    return out;
  }, {});
}

function toApi(row) {
  if (!row) return row;
  const output = {
    id:            row.id,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
    createdBy:     row.created_by_name || '',
    updatedBy:     row.updated_by_name || '',
  };
  for (const [apiField, dbField] of Object.entries(fieldMap)) {
    output[apiField] = row[dbField];
  }
  return output;
}

// All logged-in roles can read questions
const READ_ROLES  = [requireAuth, requireRole('admin', 'adder', 'viewer')];
// Admin + adder can write
const WRITE_ROLES = [requireAuth, requireRole('admin', 'adder')];

// ── GET /api/questions?subject=X&qType=Y ──────────────────────────────────
router.get('/', ...READ_ROLES, async (req, res) => {
  let query = supabase
    .from('questions')
    .select('*')
    .order('created_at', { ascending: false });

  if (req.query.subject) query = query.eq('subject', req.query.subject);
  if (req.query.qType)   query = query.eq('q_type',  req.query.qType);

  const { data, error } = await query;
  if (error) {
    return res.status(500).json({ error: 'Failed to fetch questions.', details: error.message });
  }
  res.json(data.map(toApi));
});

// ── GET /api/questions/:id ─────────────────────────────────────────────────
router.get('/:id', ...READ_ROLES, async (req, res) => {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch question.', details: error.message });
  }
  if (!data) return res.status(404).json({ error: 'Question not found.' });
  res.json(toApi(data));
});

// ── POST /api/questions ────────────────────────────────────────────────────
router.post('/', ...WRITE_ROLES, async (req, res) => {
  const payload = toDatabase(req.body);

  // Inject ownership from the authenticated user
  payload.created_by      = req.user.userId;
  payload.created_by_name = req.user.name;
  payload.updated_by      = req.user.userId;
  payload.updated_by_name = req.user.name;

  const { data, error } = await supabase
    .from('questions')
    .insert(payload)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: 'Failed to create question.', details: error.message });
  }

  await writeAuditLog({
    userId: req.user.userId, userName: req.user.name,
    action: 'CREATE_QUESTION', resourceType: 'question',
    resourceId: data.id,
    details: { subject: data.subject, qType: data.q_type, chapter: data.chapter },
  });

  res.status(201).json(toApi(data));
});

// ── PUT /api/questions/:id ─────────────────────────────────────────────────
router.put('/:id', ...WRITE_ROLES, async (req, res) => {
  const payload = toDatabase(req.body);
  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ error: 'No valid fields supplied.' });
  }

  // Record who last edited
  payload.updated_by      = req.user.userId;
  payload.updated_by_name = req.user.name;

  const { data, error } = await supabase
    .from('questions')
    .update(payload)
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error) {
    return res.status(400).json({ error: 'Failed to update question.', details: error.message });
  }
  if (!data) return res.status(404).json({ error: 'Question not found.' });

  await writeAuditLog({
    userId: req.user.userId, userName: req.user.name,
    action: 'UPDATE_QUESTION', resourceType: 'question',
    resourceId: req.params.id,
    details: { subject: data.subject, qType: data.q_type },
  });

  res.json(toApi(data));
});

// ── DELETE /api/questions/:id ──────────────────────────────────────────────
router.delete('/:id', ...WRITE_ROLES, async (req, res) => {
  const { data, error } = await supabase
    .from('questions')
    .delete()
    .eq('id', req.params.id)
    .select('id, subject, q_type')
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: 'Failed to delete question.', details: error.message });
  }
  if (!data) return res.status(404).json({ error: 'Question not found.' });

  await writeAuditLog({
    userId: req.user.userId, userName: req.user.name,
    action: 'DELETE_QUESTION', resourceType: 'question',
    resourceId: req.params.id,
    details: { subject: data.subject, qType: data.q_type },
  });

  res.json({ success: true, deletedId: data.id });
});

module.exports = router;
