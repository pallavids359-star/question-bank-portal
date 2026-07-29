const express = require('express');
const supabase = require('../lib/supabase');

const router = express.Router();

const fieldMap = {
  subject: 'subject',
  klass: 'klass',
  chapter: 'chapter',
  topic: 'topic',
  exams: 'exams',
  qType: 'q_type',
  question: 'question',
  optA: 'opt_a',
  optB: 'opt_b',
  optC: 'opt_c',
  optD: 'opt_d',
  assertion: 'assertion',
  reason: 'reason',
  predefOptions: 'predef_options',
  columnA: 'column_a',
  columnB: 'column_b',
  matchOptions: 'match_options',
  numAnswer: 'num_answer',
  correctOption: 'correct_option',
  solutionText: 'solution_text',
};

function toDatabase(input) {
  return Object.entries(fieldMap).reduce((output, [apiField, dbField]) => {
    if (Object.prototype.hasOwnProperty.call(input, apiField)) {
      output[dbField] = input[apiField];
    }
    return output;
  }, {});
}

function toApi(row) {
  if (!row) return row;

  const output = {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  for (const [apiField, dbField] of Object.entries(fieldMap)) {
    output[apiField] = row[dbField];
  }

  return output;
}

// GET /api/questions?subject=Physics&qType=mcq_single
router.get('/', async (req, res) => {
  let query = supabase
    .from('questions')
    .select('*')
    .order('created_at', { ascending: false });

  if (req.query.subject) query = query.eq('subject', req.query.subject);
  if (req.query.qType) query = query.eq('q_type', req.query.qType);

  const { data, error } = await query;

  if (error) {
    return res
      .status(500)
      .json({ error: 'Failed to fetch questions', details: error.message });
  }

  res.json(data.map(toApi));
});

// GET /api/questions/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) {
    return res
      .status(500)
      .json({ error: 'Failed to fetch question', details: error.message });
  }
  if (!data) return res.status(404).json({ error: 'Question not found' });

  res.json(toApi(data));
});

// POST /api/questions
router.post('/', async (req, res) => {
  const payload = toDatabase(req.body);
  const { data, error } = await supabase
    .from('questions')
    .insert(payload)
    .select()
    .single();

  if (error) {
    return res
      .status(400)
      .json({ error: 'Failed to create question', details: error.message });
  }

  res.status(201).json(toApi(data));
});

// PUT /api/questions/:id
router.put('/:id', async (req, res) => {
  const payload = toDatabase(req.body);
  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ error: 'No valid fields supplied' });
  }

  const { data, error } = await supabase
    .from('questions')
    .update(payload)
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error) {
    return res
      .status(400)
      .json({ error: 'Failed to update question', details: error.message });
  }
  if (!data) return res.status(404).json({ error: 'Question not found' });

  res.json(toApi(data));
});

// DELETE /api/questions/:id
router.delete('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('questions')
    .delete()
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();

  if (error) {
    return res
      .status(500)
      .json({ error: 'Failed to delete question', details: error.message });
  }
  if (!data) return res.status(404).json({ error: 'Question not found' });

  res.json({ success: true, deletedId: data.id });
});

module.exports = router;
