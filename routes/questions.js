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
  // Older databases reject statement_based. It is stored as mcq_single and
  // restored to statement_based from an internal solution metadata marker.
  statement_based:     'mcq_single',
  assertion_reason:    'assertion_reason',
  match:               'mcq_single',
  matrix:              'mcq_single',
  numerical:           'numerical',
  integer:             'numerical',
  true_false:          'mcq_single',
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

const isValidUuid = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

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
  'correct_option', 'solution_text',
  'created_by', 'created_by_name', 'updated_by', 'updated_by_name'
];

// The original production table has no difficulty column. Keep the value in
// solution_text using an internal marker, then remove it again in API output.
// This preserves Easy/Medium/Hard without requiring access to Supabase.
const LEGACY_META_LINE_RE = /(?:^|\r?\n)\[QBP_(?:DIFFICULTY|TYPE|DATA):[^\]\r\n]*\]/gi;
const DIFFICULTY_MARKER_RE = /\[QBP_DIFFICULTY:(Easy|Medium|Hard)\]/i;
const TYPE_MARKER_RE = /\[QBP_TYPE:(statement_based|match|true_false)\]/i;
const DATA_MARKER_RE = /\[QBP_DATA:([A-Za-z0-9+/=]*)\]/i;

function stripLegacyMetadata(solutionText) {
  return String(solutionText || '').replace(LEGACY_META_LINE_RE, '').trimEnd();
}

function encodeMarkerText(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64');
}

function decodeMarkerText(value) {
  try {
    return Buffer.from(String(value || ''), 'base64').toString('utf8');
  } catch (_) {
    return '';
  }
}

function storeLegacyMetadata(solutionText, difficulty, questionType, specialData) {
  const cleanSolution = stripLegacyMetadata(solutionText);
  const normalized = /^(easy|medium|hard)$/i.test(String(difficulty || ''))
    ? String(difficulty).charAt(0).toUpperCase() + String(difficulty).slice(1).toLowerCase()
    : 'Medium';
  const markers = [];
  const normalizedType = String(questionType || '').toLowerCase();
  if (['statement_based', 'match', 'true_false'].includes(normalizedType)) {
    markers.push(`[QBP_TYPE:${normalizedType}]`);
    markers.push(`[QBP_DATA:${encodeMarkerText(JSON.stringify(specialData || {}))}]`);
  }
  markers.push(`[QBP_DIFFICULTY:${normalized}]`);
  return `${cleanSolution}${cleanSolution ? '\n' : ''}${markers.join('\n')}`;
}

function readLegacyDifficulty(solutionText) {
  const match = String(solutionText || '').match(DIFFICULTY_MARKER_RE);
  if (!match) return null;
  return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
}

function readLegacyQuestionType(solutionText) {
  const match = String(solutionText || '').match(TYPE_MARKER_RE);
  return match ? match[1].toLowerCase() : null;
}

function readLegacyData(solutionText) {
  const match = String(solutionText || '').match(DATA_MARKER_RE);
  if (!match) return {};
  try {
    return JSON.parse(decodeMarkerText(match[1])) || {};
  } catch (_) {
    return {};
  }
}

function extractStatementPair(questionText) {
  const text = String(questionText || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return { statement1: '', statement2: '' };
  const first = text.match(
    /(?:^|\n)\s*@?Statement\s*(?:I|1|A)\s*[:.\-)—]?\s*([\s\S]*?)(?=\n\s*@?Statement\s*(?:II|2|B)\b)/i
  );
  const second = text.match(
    /(?:^|\n)\s*@?Statement\s*(?:II|2|B)\s*[:.\-)—]?\s*([\s\S]*?)(?=\n\s*(?:\(?[A-D]\)?\s*[).:\-]|(?:Ans|Answer|Solution|Explanation)\s*[:.\-])|$)/i
  );
  return {
    statement1: first ? first[1].trim() : '',
    statement2: second ? second[1].trim() : ''
  };
}

// Older bulk imports sometimes stored all Column B values in one array item,
// for example: "(i) Fucus (ii) Chlorella (iii) Gelidium (iv) Polysiphonia".
// Expand that legacy value into separate rows whenever it is read or saved.
function normalizeColumnBRows(values) {
  const source = Array.isArray(values) ? values : (values ? [values] : []);
  const markerSource = '(?:iv|iii|ii|i|[P-S]|[1-4])';
  const markerGlobal = new RegExp(`(?:\\(${markerSource}\\)|${markerSource}[.:\\-])\\s+`, 'gi');
  const splitBeforeMarker = new RegExp(`(?=\\s*(?:\\(${markerSource}\\)|${markerSource}[.:\\-])\\s+)`, 'gi');
  const removeMarker = new RegExp(`^\\s*(?:\\(${markerSource}\\)|${markerSource}[.:\\-])\\s*`, 'i');

  return source.flatMap(value => {
    const text = String(value || '').trim();
    if (!text) return [];
    const markers = text.match(markerGlobal) || [];
    if (markers.length < 2) return [text];
    return text
      .split(splitBeforeMarker)
      .map(part => part.replace(removeMarker, '').trim())
      .filter(Boolean);
  });
}

function sanitizeRecord(record, fieldList) {
  const clean = {};
  for (const key of fieldList) {
    if (Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined && record[key] !== null) {
      clean[key] = record[key];
    }
  }
  return clean;
}

function normalizeQType(qType) {
  if (!qType) return 'mcq_single';
  return DB_QTYPE_MAP[qType.toLowerCase()] || 'mcq_single';
}

function hasSubjectAccess(user, subject) {
  const role = (user?.role || '').toLowerCase();
  const assignedSubject = user?.subject || 'All';
  if (role === 'admin' || assignedSubject === 'All') return true;
  if (assignedSubject === 'Mathematics' || assignedSubject === 'Maths') {
    return subject === 'Mathematics' || subject === 'Maths';
  }
  return subject === assignedSubject;
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

  // Fallback for correct_option if missing
  if (!out.correct_option && input.answer) {
    out.correct_option = input.answer;
  }

  // Fallback for num_answer if missing in payload
  if ((!out.num_answer || out.num_answer === '') && input.answer && (out.q_type === 'numerical' || out.q_type === 'integer')) {
    out.num_answer = input.answer;
  }

  // Keep the numerical answer in the legacy correct_option column as well.
  // Older deployed databases may not yet have num_answer, and the insert
  // fallback strips unsupported extended columns.
  if (out.q_type === 'numerical' && out.num_answer && !out.correct_option) {
    out.correct_option = out.num_answer;
  }

  // Fallback for assertion and reason if missing in payload but present in question text
  if (out.q_type === 'assertion_reason') {
    if (!out.assertion && (input.question || '')) {
      const aM = input.question.match(/Assertion\s*(?:\(A\))?\s*[:\.]?\s*([^\n]+(?:\n(?!Reason)[^\n]+)*)/i);
      if (aM) out.assertion = aM[1].trim();
    }
    if (!out.reason && (input.question || '')) {
      const rM = input.question.match(/Reason\s*(?:\(R\))?\s*[:\.]?\s*([^\n]+)+/i);
      if (rM) out.reason = rM[1].trim();
    }
  }

  // Always use the backward-compatible storage representation. Newer schemas
  // can still read this value, while older schemas avoid PGRST204 errors.
  const requestedDifficulty = input.difficulty || out.difficulty || 'Medium';
  const rawRequestedQType = String(input.qType || input.q_type || '').toLowerCase();
  const requestedQType = rawRequestedQType === 'matrix' ? 'match' : rawRequestedQType;
  if (requestedQType === 'statement_based') {
    const extractedStatements = extractStatementPair(input.question);
    out.statement1 = input.statement1 || out.statement1 || extractedStatements.statement1 || '';
    out.statement2 = input.statement2 || out.statement2 || extractedStatements.statement2 || '';
  }
  if (requestedQType === 'true_false') {
    out.opt_a = 'True';
    out.opt_b = 'False';
    out.opt_c = '';
    out.opt_d = '';
    const rawAnswer = String(input.correctOption || input.answer || out.correct_option || '').trim().toLowerCase();
    if (rawAnswer === 'true' || rawAnswer === 't' || rawAnswer === 'a') out.correct_option = 'A';
    if (rawAnswer === 'false' || rawAnswer === 'f' || rawAnswer === 'b') out.correct_option = 'B';
  }
  if (requestedQType === 'match') {
    out.column_b = normalizeColumnBRows(input.columnB || out.column_b || []);
    const combinations = input.matchOptions || out.match_options || {};
    const combinationText = value => Array.isArray(value)
      ? value.join(', ')
      : String(value || '');
    out.opt_a = combinationText(combinations.A || out.opt_a);
    out.opt_b = combinationText(combinations.B || out.opt_b);
    out.opt_c = combinationText(combinations.C || out.opt_c);
    out.opt_d = combinationText(combinations.D || out.opt_d);
  }
  out.solution_text = storeLegacyMetadata(
    out.solution_text,
    requestedDifficulty,
    requestedQType,
    {
      statement1: input.statement1 || out.statement1 || '',
      statement2: input.statement2 || out.statement2 || '',
      columnA: input.columnA || out.column_a || [],
      columnB: input.columnB || out.column_b || [],
      matchOptions: input.matchOptions || out.match_options || {}
    }
  );
  delete out.difficulty;

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
  const legacyDifficulty = readLegacyDifficulty(row.solution_text);
  const legacyQuestionType = readLegacyQuestionType(row.solution_text);
  const legacyData = readLegacyData(row.solution_text);
  output.difficulty = row.difficulty || legacyDifficulty || 'Medium';
  output.qType = legacyQuestionType || output.qType;
  if (output.qType === 'statement_based') {
    const extractedStatements = extractStatementPair(row.question);
    output.statement1 = output.statement1 || legacyData.statement1 || extractedStatements.statement1 || '';
    output.statement2 = output.statement2 || legacyData.statement2 || extractedStatements.statement2 || '';
  }
  if (legacyQuestionType === 'true_false') {
    output.optA = output.optA || 'True';
    output.optB = output.optB || 'False';
    output.optC = '';
    output.optD = '';
    const rawAnswer = String(output.correctOption || row.correct_option || '').trim().toLowerCase();
    if (rawAnswer === 'true' || rawAnswer === 't') output.correctOption = 'A';
    if (rawAnswer === 'false' || rawAnswer === 'f') output.correctOption = 'B';
  }
  if (legacyQuestionType === 'match') {
    const hasColumnA = Array.isArray(output.columnA) && output.columnA.length > 0;
    const hasColumnB = Array.isArray(output.columnB) && output.columnB.length > 0;
    const hasOptionText = options => options && typeof options === 'object' &&
      ['A', 'B', 'C', 'D'].some(key => String(options[key] || '').trim());
    const hasMatchOptions = hasOptionText(output.matchOptions);
    output.columnA = hasColumnA ? output.columnA : (legacyData.columnA || []);
    output.columnB = normalizeColumnBRows(
      hasColumnB ? output.columnB : (legacyData.columnB || [])
    );
    const metadataOptions = legacyData.matchOptions && typeof legacyData.matchOptions === 'object'
      ? legacyData.matchOptions
      : {};
    const legacyColumnOptions = {
      A: row.opt_a || '',
      B: row.opt_b || '',
      C: row.opt_c || '',
      D: row.opt_d || ''
    };
    const hasLegacyColumnOptions = Object.values(legacyColumnOptions).some(Boolean);
    output.matchOptions = hasMatchOptions
      ? output.matchOptions
      : (hasOptionText(metadataOptions)
          ? metadataOptions
          : (hasLegacyColumnOptions ? legacyColumnOptions : {}));
  }
  output.solutionText = stripLegacyMetadata(row.solution_text);
  if (!output.numAnswer && (row.q_type === 'numerical' || row.q_type === 'integer')) {
    output.numAnswer = row.answer || row.correct_option || '';
  }
  if (row.q_type === 'assertion_reason' && row.question) {
    if (!output.assertion) {
      const assertionMatch = row.question.match(
        /(?:Assertion\s*(?:\(A\))?|\(A\)|A)\s*[:.\-]\s*([\s\S]*?)(?=\n\s*(?:Reason\s*(?:\(R\))?|\(R\)|R)\s*[:.\-]|$)/i
      );
      if (assertionMatch) output.assertion = assertionMatch[1].trim();
    }
    if (!output.reason) {
      const reasonMatch = row.question.match(
        /(?:Reason\s*(?:\(R\))?|\(R\)|R)\s*[:.\-]\s*([\s\S]*)$/i
      );
      if (reasonMatch) output.reason = reasonMatch[1].trim();
    }
  }
  return output;
}

// All logged-in roles can read questions
const READ_ROLES   = [requireAuth, requireRole('admin', 'adder', 'editor', 'viewer')];
// Adders create/import questions; editors update existing questions.
const CREATE_ROLES = [requireAuth, requireRole('admin', 'adder')];
const EDIT_ROLES   = [requireAuth, requireRole('admin', 'adder', 'editor')];
const DELETE_ROLES = [requireAuth, requireRole('admin')];

// ── GET /api/questions?subject=X&qType=Y ──────────────────────────────────
router.get('/', ...READ_ROLES, async (req, res) => {
  let query = supabase
    .from('questions')
    .select('*')
    .order('created_at', { ascending: false });

  const userRole = (req.user?.role || 'admin').toLowerCase();
  const userSub  = req.user?.subject || 'All';

  if (userRole !== 'admin' && userSub && userSub !== 'All') {
    if (userSub === 'Mathematics' || userSub === 'Maths') {
      query = query.in('subject', ['Mathematics', 'Maths']);
    } else {
      query = query.eq('subject', userSub);
    }
  } else if (req.query.subject) {
    if (req.query.subject === 'Mathematics' || req.query.subject === 'Maths') {
      query = query.in('subject', ['Mathematics', 'Maths']);
    } else {
      query = query.eq('subject', req.query.subject);
    }
  }

  const requestedFilterType = String(req.query.qType || '').toLowerCase();
  const legacyEncodedTypes = ['statement_based', 'match', 'matrix', 'true_false'];
  if (requestedFilterType && !legacyEncodedTypes.includes(requestedFilterType)) {
    query = query.eq('q_type', normalizeQType(requestedFilterType));
  }

  const { data, error } = await query;
  if (error) {
    return res.status(500).json({ error: 'Failed to fetch questions.', details: error.message });
  }
  let questions = data.map(toApi);
  if (requestedFilterType && legacyEncodedTypes.includes(requestedFilterType)) {
    const visibleFilterType = requestedFilterType === 'matrix' ? 'match' : requestedFilterType;
    questions = questions.filter(question => question.qType === visibleFilterType);
  }
  res.json(questions);
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
  if (!hasSubjectAccess(req.user, data.subject)) {
    return res.status(403).json({ error: 'You do not have access to this subject.' });
  }
  res.json(toApi(data));
});

// ── POST /api/questions ────────────────────────────────────────────────────
router.post('/', ...CREATE_ROLES, async (req, res) => {
  const payload = toDatabase(req.body);

  if (!hasSubjectAccess(req.user, payload.subject)) {
    return res.status(403).json({ error: 'You can add questions only to your assigned subject.' });
  }

  // Inject ownership safely
  if (isValidUuid(req.user?.userId)) {
    payload.created_by = req.user.userId;
    payload.updated_by = req.user.userId;
  }
  payload.created_by_name = req.user?.name || '';
  payload.updated_by_name = req.user?.name || '';

  let { data, error } = await supabase
    .from('questions')
    .insert(payload)
    .select()
    .single();

  // Auto-fallback if database missing extended columns (e.g. statement1, assertion)
  if (error && (error.message.includes('column') || error.message.includes('schema') || error.code === 'PGRST204' || error.message.includes('statement1') || error.message.includes('assertion'))) {
    console.warn('Single insert missing extended columns, auto-stripping to basic legacy schema...');
    const basicPayload = sanitizeRecord(payload, BASIC_LEGACY_FIELDS);
    const retry = await supabase
      .from('questions')
      .insert(basicPayload)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return res.status(400).json({ error: 'Failed to create question: ' + error.message, details: error.message });
  }

  await writeAuditLog({
    userId: isValidUuid(req.user?.userId) ? req.user.userId : null,
    userName: req.user?.name || 'User',
    action: 'CREATE_QUESTION', resourceType: 'question',
    resourceId: data.id,
    details: { subject: data.subject, qType: data.q_type, chapter: data.chapter },
  }).catch(err => console.warn('Audit log failed:', err.message));

  res.status(201).json(toApi(data));
});


// ── POST /api/questions/batch ──────────────────────────────────────────────
router.post('/batch', ...CREATE_ROLES, async (req, res) => {
  const items = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Payload must be a non-empty array of questions.' });
  }

  const userId = req.user.userId;
  const userName = req.user.name;

  const recordsToInsert = items.map(item => {
    const payload = toDatabase(item);
    if (isValidUuid(userId)) {
      payload.created_by = userId;
      payload.updated_by = userId;
    }
    payload.created_by_name = userName || '';
    payload.updated_by_name = userName || '';
    return sanitizeRecord(payload, CORE_FIELDS);
  });

  if (recordsToInsert.some(record => !hasSubjectAccess(req.user, record.subject))) {
    return res.status(403).json({ error: 'The batch contains questions outside your assigned subject.' });
  }

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
    userId: isValidUuid(userId) ? userId : null,
    userName: userName || 'User',
    action: 'BULK_CREATE_QUESTIONS', resourceType: 'question',
    resourceId: `batch_${insertedData.length}`,
    details: { totalImported: insertedData.length },
  }).catch(err => console.warn('Audit log failed:', err.message));

  res.status(201).json({
    success: true,
    count: insertedData.length,
    data: insertedData.map(toApi)
  });
});



// ── PUT /api/questions/:id ─────────────────────────────────────────────────
router.put('/:id', ...EDIT_ROLES, async (req, res) => {
  const { data: existingQuestion, error: existingError } = await supabase
    .from('questions')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (existingError) return res.status(500).json({ error: existingError.message });
  if (!existingQuestion) return res.status(404).json({ error: 'Question not found.' });

  const userRole = String(req.user?.role || '').toLowerCase();
  let payload;

  if (userRole === 'editor') {
    const requestedDifficulty = String(req.body?.difficulty || '').trim();
    if (!/^(easy|medium|hard)$/i.test(requestedDifficulty)) {
      return res.status(400).json({ error: 'Editors may change only the difficulty to Easy, Medium, or Hard.' });
    }
    const normalizedDifficulty = requestedDifficulty.charAt(0).toUpperCase() + requestedDifficulty.slice(1).toLowerCase();
    const storedType = readLegacyQuestionType(existingQuestion.solution_text) || existingQuestion.q_type || 'mcq_single';
    const storedSpecialData = readLegacyData(existingQuestion.solution_text);

    // Editors are deliberately limited to difficulty. Preserve every other
    // value exactly as stored, including compatibility metadata.
    payload = {
      solution_text: storeLegacyMetadata(
        existingQuestion.solution_text,
        normalizedDifficulty,
        storedType,
        storedSpecialData
      )
    };
    if (Object.prototype.hasOwnProperty.call(existingQuestion, 'difficulty')) {
      payload.difficulty = normalizedDifficulty;
    }
  } else {
    // Admins and Adders can fully edit the question.
    payload = toDatabase(req.body);
  }

  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ error: 'No valid fields supplied.' });
  }

  if (!hasSubjectAccess(req.user, existingQuestion.subject) ||
      (payload.subject && !hasSubjectAccess(req.user, payload.subject))) {
    return res.status(403).json({ error: 'You can edit questions only in your assigned subject.' });
  }

  // Record who last edited safely
  if (isValidUuid(req.user?.userId)) {
    payload.updated_by = req.user.userId;
  }
  payload.updated_by_name = req.user?.name || '';

  let { data, error } = await supabase
    .from('questions')
    .update(payload)
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  // Auto-fallback if database missing extended columns (e.g. statement1, assertion)
  if (error && (error.message.includes('column') || error.message.includes('schema') || error.code === 'PGRST204' || error.message.includes('statement1') || error.message.includes('assertion'))) {
    console.warn('Update question missing extended columns, auto-stripping to basic legacy schema...');
    const basicPayload = sanitizeRecord(payload, BASIC_LEGACY_FIELDS);
    const retry = await supabase
      .from('questions')
      .update(basicPayload)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return res.status(400).json({ error: 'Failed to update question: ' + error.message, details: error.message });
  }
  if (!data) return res.status(404).json({ error: 'Question not found.' });

  await writeAuditLog({
    userId: isValidUuid(req.user?.userId) ? req.user.userId : null,
    userName: req.user?.name || 'User',
    action: userRole === 'editor' ? 'UPDATE_QUESTION_DIFFICULTY' : 'UPDATE_QUESTION', resourceType: 'question',
    resourceId: req.params.id,
    details: { subject: data.subject, qType: data.q_type },
  }).catch(err => console.warn('Audit log failed:', err.message));

  res.json(toApi(data));
});


// ── DELETE /api/questions/:id ──────────────────────────────────────────────
router.delete('/:id', ...DELETE_ROLES, async (req, res) => {
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
    userId: isValidUuid(req.user?.userId) ? req.user.userId : null,
    userName: req.user?.name || 'User',
    action: 'DELETE_QUESTION', resourceType: 'question',
    resourceId: req.params.id,
    details: { subject: data.subject, qType: data.q_type },
  }).catch(err => console.warn('Audit log failed:', err.message));

  res.json({ success: true, deletedId: data.id });
});

module.exports = router;
