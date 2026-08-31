'use strict';

const express = require('express');
const supabase = require('../lib/supabase-control');
const supabasePhysics11 = require('../lib/supabase-physics-11');
const supabasePhysics12 = require('../lib/supabase-physics-12');
const supabaseChemistry11 = require('../lib/supabase-chemistry-11');
const supabaseChemistry12 = require('../lib/supabase-chemistry-12');
const supabaseBiology11 = require('../lib/supabase-biology-11');
const supabaseBiology12 = require('../lib/supabase-biology-12');
const supabaseMathematics11 = require('../lib/supabase-mathematics-11');
const supabaseMathematics12 = require('../lib/supabase-mathematics-12');
const { requireAuth, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');
const { toLogicalUser } = require('../lib/user-role');

const router = express.Router();

async function requireActiveSession(req, res, next) {
  const sessionId = req.user?.loginHistoryId;
  const userId = req.user?.userId;
  if (!sessionId || !userId) return res.status(401).json({ error: 'Session is no longer valid.' });
  const { data, error } = await supabase.from('login_history')
    .select('id, status, logout_time')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return res.status(503).json({ error: 'Session validation service is unavailable.' });
  if (!data || data.status !== 'success' || data.logout_time) {
    return res.status(401).json({ error: 'Session is no longer valid.' });
  }
  next();
}

const ACTIVE_USER = [requireAuth, requireActiveSession];
const EDITOR_ONLY = [requireAuth, requireActiveSession, requireRole('editor', 'admin')];
const REVIEW_DASHBOARD_ROLES = [requireAuth, requireActiveSession, requireRole('editor', 'admin')];

const REVIEW_NOTIFICATION_TYPES = [
  'question_review',
  'question_updated',
  'question_accepted',
  'question_acceptance_reversed',
];

const QUESTION_CLIENTS = [
  supabase,
  supabasePhysics11,
  supabasePhysics12,
  supabaseChemistry11,
  supabaseChemistry12,
  supabaseBiology11,
  supabaseBiology12,
  supabaseMathematics11,
  supabaseMathematics12,
];

function canonicalSubject(subject) {
  const value = String(subject || '').trim();
  const known = { physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology', mathematics: 'Mathematics', maths: 'Mathematics', all: 'All' };
  return known[value.toLowerCase()] || value;
}

function normalizedClass(klass) {
  return String(klass || '').replace(/^class\s*/i, '').trim();
}

function hintedQuestionClient(subject, klass) {
  const key = `${canonicalSubject(subject)}:${normalizedClass(klass)}`;
  return {
    'Physics:11': supabasePhysics11,
    'Physics:12': supabasePhysics12,
    'Chemistry:11': supabaseChemistry11,
    'Chemistry:12': supabaseChemistry12,
    'Biology:11': supabaseBiology11,
    'Biology:12': supabaseBiology12,
    'Mathematics:11': supabaseMathematics11,
    'Mathematics:12': supabaseMathematics12,
  }[key] || (normalizedClass(klass).toLowerCase() === 'full syllabus' ? supabase : null);
}

async function findQuestionAcrossShards(questionId, subject, klass) {
  const hinted = hintedQuestionClient(subject, klass);
  const clients = hinted
    ? [hinted, ...QUESTION_CLIENTS.filter(client => client !== hinted)]
    : QUESTION_CLIENTS;

  for (const client of clients) {
    const result = await client.from('questions').select('*').eq('id', questionId).maybeSingle();
    if (result.error) return { question: null, client, error: result.error };
    if (result.data) return { question: result.data, client, error: null };
  }
  return { question: null, client: hinted || supabase, error: null };
}

function validDifficulty(value) {
  const text = String(value || '').trim();
  return /^(easy|medium|hard)$/i.test(text)
    ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
    : '';
}

function visibleNotificationTypes(role) {
  const normalizedRole = String(role || '').toLowerCase();
  if (normalizedRole === 'admin') return ['question_review', 'question_updated'];
  if (normalizedRole === 'editor') return ['question_updated'];
  return ['question_review'];
}

function isSchemaError(error) {
  return /notifications|relation|schema cache/i.test(String(error?.message || ''));
}

function tableError(res, error) {
  return res.status(503).json({
    error: 'The existing notification service is temporarily unavailable.',
    details: error.message,
    code: 'NOTIFICATIONS_UNAVAILABLE',
  });
}

async function effectiveUser(sessionUser) {
  const columns = 'id, name, email, role, subject, status';
  let result;
  if (sessionUser?.userId) {
    result = await supabase.from('users').select(columns).eq('id', sessionUser.userId).maybeSingle();
  }
  if (!result?.data && sessionUser?.email) {
    result = await supabase.from('users').select(columns).ilike('email', sessionUser.email).maybeSingle();
  }
  return toLogicalUser(result?.data || sessionUser || {});
}

function hasSubjectAccess(user, subject) {
  const assigned = canonicalSubject(user?.subject || 'All');
  return String(user?.role || '').toLowerCase() === 'admin' || assigned === 'All' || assigned === canonicalSubject(subject);
}

async function getQuestionForEditor(req, res) {
  const questionId = String(req.body?.questionId || '').trim();
  if (!questionId) {
    res.status(400).json({ error: 'questionId is required.' });
    return null;
  }
  const { question, client, error } = await findQuestionAcrossShards(
    questionId,
    req.body?.subject,
    req.body?.klass
  );
  if (error) {
    res.status(500).json({ error: error.message });
    return null;
  }
  if (!question) {
    res.status(404).json({ error: 'Question not found.' });
    return null;
  }
  const user = await effectiveUser(req.user);
  if (!hasSubjectAccess(user, question.subject)) {
    res.status(403).json({ error: `You can review only ${user.subject || 'your assigned subject'} questions.` });
    return null;
  }
  return { questionId, question, questionClient: client, user };
}

async function findRecipient(question) {
  if (question.created_by) return question.created_by;
  if (!question.created_by_name) return null;
  const { data } = await supabase.from('users').select('id').ilike('name', question.created_by_name).maybeSingle();
  return data?.id || null;
}

function cleanSolutionWithDifficulty(question, difficulty) {
  const clean = String(question.solution_text || '')
    .replace(/(?:^|\r?\n)\[QBP_DIFFICULTY:(?:Easy|Medium|Hard)\]/gi, '')
    .trimEnd();
  return `${clean}${clean ? '\n' : ''}[QBP_DIFFICULTY:${difficulty}]`;
}

function stateFromNotification(row) {
  const accepted = row?.type === 'question_accepted';
  const reversed = row?.type === 'question_acceptance_reversed';
  return {
    question_id: row.question_id,
    status: accepted ? 'accepted' : reversed ? 'pending' : 'reviewed',
    last_action: accepted
      ? 'question_accepted'
      : reversed
        ? 'question_acceptance_reversed'
        : 'review_sent',
    last_editor_id: row.sender_id || null,
    last_editor_name: row.sender_name || 'Editor',
    last_message: row.message || '',
    difficulty: row.difficulty || null,
    updated_at: row.created_at || null,
    accepted_at: accepted ? row.created_at || null : null,
  };
}

async function notifyOwner({ question, questionId, user, type, title, message, difficulty = null }) {
  const recipientId = await findRecipient(question);
  if (!recipientId) throw new Error('This question has no linked Adder account, so a notification cannot be delivered.');
  const preview = String(question.question || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const { data, error } = await supabase.from('notifications').insert({
    recipient_id: recipientId,
    sender_id: user.id || user.userId || null,
    sender_name: user.name || 'Editor',
    question_id: questionId,
    type,
    title,
    message,
    difficulty,
    metadata: { chapter: question.chapter || '', preview },
  }).select().single();
  if (error) throw error;
  return data;
}

router.get('/', ...ACTIVE_USER, async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const user = await effectiveUser(req.user);
  const role = String(user?.role || '').toLowerCase();
  const visibleTypes = visibleNotificationTypes(role);
  const { data, error } = await supabase
    .from('notifications')
    .select('id, recipient_id, sender_id, sender_name, question_id, type, title, message, difficulty, is_read, created_at, read_at')
    .eq('recipient_id', req.user.userId)
    .in('type', visibleTypes)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return isSchemaError(error) ? tableError(res, error) : res.status(500).json({ error: error.message });
  const rows = data || [];
  res.json({ data: rows, unread: rows.filter(row => !row.is_read).length });
});

// Return only the unread count so the badge can update without reloading the
// page or downloading the complete notification list.
router.get('/unread-count', ...ACTIVE_USER, async (req, res) => {
  const user = await effectiveUser(req.user);
  const role = String(user?.role || '').toLowerCase();
  const visibleTypes = visibleNotificationTypes(role);
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', req.user.userId)
    .in('type', visibleTypes)
    .eq('is_read', false);

  if (error) {
    return isSchemaError(error)
      ? tableError(res, error)
      : res.status(500).json({ error: error.message });
  }

  res.setHeader('Cache-Control', 'no-store');
  res.json({ unread: Number(count) || 0 });
});

// Lightweight current status for the questions displayed on the current page.
router.get('/question-states', ...ACTIVE_USER, async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 100);
  if (!ids.length) return res.json({ data: [] });
  const user = await effectiveUser(req.user);

  const questionResults = await Promise.all(
    QUESTION_CLIENTS.map(client => client.from('questions').select('id, subject').in('id', ids))
  );
  const questionError = questionResults.find(result => result.error)?.error;
  if (questionError) return res.status(500).json({ error: questionError.message });
  const allowedIds = questionResults.flatMap(result => result.data || [])
    .filter(question => hasSubjectAccess(user, question.subject))
    .map(question => String(question.id));
  if (!allowedIds.length) return res.json({ data: [] });

  const { data, error } = await supabase.from('notifications')
    .select('question_id, type, sender_id, sender_name, message, difficulty, created_at')
    .in('question_id', allowedIds)
    .in('type', ['question_review', 'question_accepted', 'question_acceptance_reversed'])
    .order('created_at', { ascending: false });
  if (error) return isSchemaError(error) ? tableError(res, error) : res.status(500).json({ error: error.message });

  const latest = new Map();
  for (const row of data || []) {
    const id = String(row.question_id || '');
    if (id && !latest.has(id)) latest.set(id, stateFromNotification(row));
  }
  res.json({ data: [...latest.values()] });
});

// Admins and Editors see only questions they personally reviewed. A received
// question_updated row keeps that question in the dashboard after the original
// actionable review notification has been removed from the contributor feed.
// Status is derived from the newest event for those user-owned workflows.
router.get('/review-dashboard', ...REVIEW_DASHBOARD_ROLES, async (req, res) => {
  const limit = Math.min(1000, Math.max(1, Number.parseInt(req.query.limit, 10) || 500));
  const user = await effectiveUser(req.user);
  const userId = user?.id || req.user.userId;
  const columns = 'id, recipient_id, sender_id, sender_name, question_id, type, title, message, difficulty, is_read, created_at, read_at, metadata';

  const [sent, received] = await Promise.all([
    supabase.from('notifications').select(columns).eq('sender_id', userId).in('type', REVIEW_NOTIFICATION_TYPES).order('created_at', { ascending: false }).limit(limit),
    supabase.from('notifications').select(columns).eq('recipient_id', userId).in('type', REVIEW_NOTIFICATION_TYPES).order('created_at', { ascending: false }).limit(limit),
  ]);
  const error = sent.error || received.error;
  if (error) return isSchemaError(error) ? tableError(res, error) : res.status(500).json({ error: error.message });

  const reviewedQuestionIds = new Set([
    ...(sent.data || []).filter(row => row.type === 'question_review').map(row => String(row.question_id || '')),
    ...(received.data || []).filter(row => row.type === 'question_updated').map(row => String(row.question_id || '')),
  ].filter(Boolean));
  const unique = new Map();
  for (const row of [...(sent.data || []), ...(received.data || [])]) {
    if (reviewedQuestionIds.has(String(row.question_id || ''))) unique.set(String(row.id), row);
  }
  const rows = [...unique.values()]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, limit);

  const byQuestion = new Map();
  for (const row of rows) {
    const questionId = String(row.question_id || '').trim();
    if (!questionId) continue;
    if (!byQuestion.has(questionId)) {
      const state = stateFromNotification(row);
      if (row.type === 'question_updated') {
        state.status = 'updated';
        state.last_action = 'question_updated';
      }
      byQuestion.set(questionId, {
        question_id: questionId,
        status: state.status,
        last_action: state.last_action,
        last_editor_name: state.last_editor_name,
        last_message: row.message || '',
        updated_at: row.created_at || null,
        notification_read: Boolean(row.is_read),
        title: row.title || '',
        chapter: row.metadata?.chapter || '',
        preview: row.metadata?.preview || '',
      });
    }
  }

  const data = [...byQuestion.values()];
  const totals = data.reduce((summary, item) => {
    summary.total += 1;
    summary[item.status] = (summary[item.status] || 0) + 1;
    return summary;
  }, { total: 0, pending: 0, reviewed: 0, updated: 0, accepted: 0 });

  res.setHeader('Cache-Control', 'no-store');
  res.json({ data, totals });
});

// Difficulty is independent from review messages.
router.post('/difficulty', ...EDITOR_ONLY, async (req, res) => {
  const difficulty = validDifficulty(req.body?.difficulty);
  if (!difficulty) return res.status(400).json({ error: 'Select Easy, Medium, or Hard.' });
  const context = await getQuestionForEditor(req, res);
  if (!context) return;
  const { questionId, question, questionClient, user } = context;
  const payload = { solution_text: cleanSolutionWithDifficulty(question, difficulty), updated_by_name: user.name || 'Editor' };
  if (Object.prototype.hasOwnProperty.call(question, 'difficulty')) payload.difficulty = difficulty;
  let result = await questionClient.from('questions').update(payload).eq('id', questionId).select('id').maybeSingle();
  if (result.error && /difficulty|column|schema/i.test(result.error.message || '')) {
    delete payload.difficulty;
    result = await questionClient.from('questions').update(payload).eq('id', questionId).select('id').maybeSingle();
  }
  if (result.error) return res.status(400).json({ error: result.error.message });
  await writeAuditLog({ userId: user.id || user.userId, userName: user.name || 'Editor', action: 'SET_QUESTION_DIFFICULTY', resourceType: 'question', resourceId: questionId, details: { difficulty } }).catch(() => {});
  res.json({ success: true, difficulty });
});

// A review sends only the Editor's message; it does not change difficulty.
router.post('/review', ...EDITOR_ONLY, async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Enter a review message.' });
  if (message.length > 1000) return res.status(400).json({ error: 'Review message must be 1000 characters or fewer.' });
  const context = await getQuestionForEditor(req, res);
  if (!context) return;
  const { questionId, question, user } = context;
  try {
    const notification = await notifyOwner({
      question, questionId, user, type: 'question_review',
      title: `Question review · ${question.subject || 'General'}`, message,
    });
    await writeAuditLog({ userId: user.id || user.userId, userName: user.name || 'Editor', action: 'SEND_QUESTION_REVIEW', resourceType: 'question', resourceId: questionId, details: { recipientId: notification.recipient_id } }).catch(() => {});
    res.status(201).json({ success: true, notification, state: stateFromNotification(notification) });
  } catch (error) {
    return isSchemaError(error) ? tableError(res, error) : res.status(400).json({ error: error.message });
  }
});

router.post('/accept', ...EDITOR_ONLY, async (req, res) => {
  const context = await getQuestionForEditor(req, res);
  if (!context) return;
  const { questionId, question, user } = context;
  try {
    const shouldAccept = req.body?.accepted !== false;
    const existing = await supabase.from('notifications')
      .select('question_id, type, sender_id, sender_name, message, difficulty, created_at')
      .eq('question_id', questionId)
      .in('type', ['question_accepted', 'question_acceptance_reversed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.error) throw existing.error;
    const currentlyAccepted = existing.data?.type === 'question_accepted';
    if (currentlyAccepted === shouldAccept && existing.data) {
      if (shouldAccept) {
        const acceptedNotification = await supabase.from('notifications')
          .select('question_id, type, sender_id, sender_name, message, difficulty, created_at')
          .eq('question_id', questionId)
          .eq('type', 'question_accepted')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (acceptedNotification.error) throw acceptedNotification.error;
        if (acceptedNotification.data) {
          return res.json({
            success: true,
            accepted: true,
            alreadyAccepted: true,
            unchanged: true,
            notification: acceptedNotification.data,
            state: stateFromNotification(acceptedNotification.data),
          });
        }
      }
      return res.json({
        success: true,
        accepted: currentlyAccepted,
        unchanged: true,
        notification: existing.data,
        state: stateFromNotification(existing.data),
      });
    }
    if (!shouldAccept && !currentlyAccepted) {
      return res.json({
        success: true,
        accepted: false,
        unchanged: true,
        state: {
          question_id: questionId,
          status: 'pending',
          last_action: 'question_acceptance_reversed',
          accepted_at: null,
          updated_at: null,
        },
      });
    }
    const type = shouldAccept ? 'question_accepted' : 'question_acceptance_reversed';
    const message = String(req.body?.message || '').trim() || (shouldAccept
      ? 'Your question has been accepted.'
      : 'The acceptance of your question has been reversed.');
    const notification = await notifyOwner({
      question,
      questionId,
      user,
      type,
      title: `${shouldAccept ? 'Question accepted' : 'Acceptance reversed'} · ${question.subject || 'General'}`,
      message,
    });
    await writeAuditLog({
      userId: user.id || user.userId,
      userName: user.name || 'Editor',
      action: shouldAccept ? 'ACCEPT_QUESTION' : 'REVERSE_QUESTION_ACCEPTANCE',
      resourceType: 'question',
      resourceId: questionId,
      details: { recipientId: notification.recipient_id },
    }).catch(() => {});
    res.json({ success: true, accepted: shouldAccept, notification, state: stateFromNotification(notification) });
  } catch (error) {
    return isSchemaError(error) ? tableError(res, error) : res.status(400).json({ error: error.message });
  }
});

router.put('/read-all/current', ...ACTIVE_USER, async (req, res) => {
  const { error } = await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('recipient_id', req.user.userId).eq('is_read', false);
  if (error) return isSchemaError(error) ? tableError(res, error) : res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.put('/:id/read', ...ACTIVE_USER, async (req, res) => {
  const { data, error } = await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', req.params.id).eq('recipient_id', req.user.userId).select('id, is_read, read_at').maybeSingle();
  if (error) return isSchemaError(error) ? tableError(res, error) : res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Notification not found.' });
  res.json(data);
});

router.delete('/:id', ...ACTIVE_USER, async (req, res) => {
  const { data, error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', req.params.id)
    .eq('recipient_id', req.user.userId)
    .in('type', ['question_review', 'question_updated'])
    .select('id')
    .maybeSingle();

  if (error) return isSchemaError(error) ? tableError(res, error) : res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Notification not found.' });
  res.json({ success: true, deletedId: data.id });
});

module.exports = router;
