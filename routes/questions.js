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
  statement1:    'statement1',
  statement2:    'statement2',
  predefOptions: 'predef_options',
  columnA:       'column_a',
  columnB:       'column_b',
  matchOptions:  'match_options',
  numAnswer:     'num_answer',
  correctOption: 'correct_option',
  solutionText:  'solution_text',
  difficulty:    'difficulty',
  marks:         'marks',
  negMarks:      'neg_marks',
  language:      'language',
  source:        'source',
  author:        'author',
  referenceBook: 'reference_book',
  status:        'status',
  tags:          'tags',
  year:          'year',
  attemptLevel:  'attempt_level',
  board:         'board',
};

const DB_QTYPE_MAP = {
  mcq_single:          'mcq_single',
  mcq_multiple:        'mcq_single',
  statement_based:     'statement_based',
  assertion_reason:    'assertion_reason',
  match:               'match',
  matrix:              'match',
  numerical:           'numerical',
  integer:             'numerical',
  true_false:          'true_false',
  diagram:             'diagram_based',
  diagram_based:       'diagram_based',
  case_study:          'mcq_single',
  paragraph:           'mcq_single',
  comprehension:       'mcq_single',
  table:               'mcq_single',
  graph:               'mcq_single',
  sequence:            'mcq_single',
  reasoning:           'mcq_single',
  data_interpretation: 'mcq_single',
  fill_blank:          'numerical',
  multi_part:          'mcq_single',
};

function normalizeQType(qType) {
  if (!qType) return 'mcq_single';
  return DB_QTYPE_MAP[qType.toLowerCase()] || 'mcq_single';
}

function toDatabase(input) {
  const out = Object.entries(fieldMap).reduce((acc, [apiField, dbField]) => {
    if (Object.prototype.hasOwnProperty.call(input, apiField)) {
      acc[dbField] = input[apiField];
    }
    return acc;
  }, {});

  // Normalize q_type to match database check constraint
  out.q_type = normalizeQType(input.qType || input.q_type);

  // Fallbacks for required non-null fields
  if (!out.subject) out.subject = 'General';
  if (!out.klass)   out.klass   = '11';
  if (!out.chapter) out.chapter = 'General';
  if (!out.topic)   out.topic   = 'General';
  if (!out.exams || !Array.isArray(out.exams) || out.exams.length === 0) {
    out.exams = ['NEET'];
  }

  return out;
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

// ── POST /api/questions/batch ──────────────────────────────────────────────
router.post('/batch', ...WRITE_ROLES, async (req, res) => {
  const items = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Payload must be a non-empty array of questions.' });
  }

  const userId = req.user.userId;
  const userName = req.user.name;

  const CORE_FIELDS = [
    'subject', 'klass', 'chapter', 'topic', 'exams', 'q_type',
    'question', 'opt_a', 'opt_b', 'opt_c', 'opt_d', 'assertion', 'reason',
    'statement1', 'statement2',
    'predef_options', 'column_a', 'column_b', 'match_options',
    'num_answer', 'correct_option', 'solution_text',
    'difficulty', 'marks', 'neg_marks', 'language', 'source', 'author', 'reference_book',
    'created_by', 'created_by_name', 'updated_by', 'updated_by_name'
  ];

  const BASIC_LEGACY_FIELDS = [
    'subject', 'klass', 'chapter', 'topic', 'exams', 'q_type',
    'question', 'opt_a', 'opt_b', 'opt_c', 'opt_d',
    'correct_option', 'solution_text', 'difficulty', 'marks', 'neg_marks',
    'language', 'source', 'author', 'reference_book',
    'created_by', 'created_by_name', 'updated_by', 'updated_by_name'
  ];

  function sanitizeRecord(record, fieldList) {
    const clean = {};
    for (const key of fieldList) {
      if (Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined && record[key] !== null) {
        clean[key] = record[key];
      }
    }
    return clean;
  }

  const recordsToInsert = items.map(item => {
    const payload = toDatabase(item);
    payload.created_by      = userId;
    payload.created_by_name = userName;
    payload.updated_by      = userId;
    payload.updated_by_name = userName;
    return sanitizeRecord(payload, CORE_FIELDS);
  });

  // Batch insert into Supabase in chunks of 50
  const chunkSize = 50;
  const insertedData = [];
  let lastErrorMessage = '';

  for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
    let chunk = recordsToInsert.slice(i, i + chunkSize);
    let { data, error } = await supabase
      .from('questions')
      .insert(chunk)
      .select();

    // Auto-fallback if database schema does not have new extended columns yet (e.g. statement1, column_a)
    if (error && (error.message.includes('column') || error.message.includes('schema') || error.code === 'PGRST204' || error.message.includes('statement1') || error.message.includes('assertion'))) {
      console.warn(`Database missing extended columns, auto-stripping to basic legacy schema...`);
      const basicChunk = chunk.map(r => sanitizeRecord(r, BASIC_LEGACY_FIELDS));
      const retry = await supabase
        .from('questions')
        .insert(basicChunk)
        .select();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.warn(`Batch chunk insert failed at offset ${i}:`, error.message);
      lastErrorMessage = error.message;

      // Sequential retry item by item
      for (const item of chunk) {
        let singleRetry = await supabase
          .from('questions')
          .insert([item])
          .select();

        if (singleRetry.error) {
          // Retry single item with basic legacy schema
          const basicItem = sanitizeRecord(item, BASIC_LEGACY_FIELDS);
          singleRetry = await supabase
            .from('questions')
            .insert([basicItem])
            .select();
        }

        if (singleRetry.error) {
          console.error(`Single item insert failed:`, singleRetry.error.message);
          lastErrorMessage = singleRetry.error.message;
        } else if (singleRetry.data && singleRetry.data.length) {
          insertedData.push(singleRetry.data[0]);
        }
      }
    } else if (data) {
      insertedData.push(...data);
    }
  }

  if (insertedData.length === 0) {
    return res.status(400).json({
      error: 'Failed to insert questions into database: ' + (lastErrorMessage || 'Please check required fields and database schema.'),
      details: lastErrorMessage
    });
  }


  await writeAuditLog({
    userId, userName,
    action: 'BULK_CREATE_QUESTIONS', resourceType: 'question',
    resourceId: `batch_${insertedData.length}`,
    details: { totalImported: insertedData.length },
  });

  res.status(201).json({
    success: true,
    count: insertedData.length,
    data: insertedData.map(toApi)
  });
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
