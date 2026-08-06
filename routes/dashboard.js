'use strict';
const express  = require('express');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { toLogicalUser } = require('../lib/user-role');

const router = express.Router();
const PAGE_SIZE = 1000;

// Read every real row without naming optional columns. Older installations may
// not yet have ownership/difficulty fields, but the dashboard must still load.
async function readAll(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function timeValue(value) {
  const valueAsTime = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(valueAsTime) ? valueAsTime : 0;
}

function isOnOrAfter(value, cutoff) {
  const valueAsTime = timeValue(value);
  return valueAsTime > 0 && valueAsTime >= cutoff.getTime();
}

function recentRows(rows, field) {
  return rows
    .filter(row => timeValue(row[field]) > 0)
    .sort((a, b) => timeValue(b[field]) - timeValue(a[field]))
    .slice(0, 5);
}

function questionBelongsToUser(question, user) {
  if (question.created_by && user.id) {
    return String(question.created_by) === String(user.id);
  }
  const ownerName = String(question.created_by_name || '').trim().toLowerCase();
  const userName = String(user.name || '').trim().toLowerCase();
  const userEmail = String(user.email || '').trim().toLowerCase();
  return Boolean(ownerName && (ownerName === userName || ownerName === userEmail));
}

function legacyValue(solutionText, key) {
  const match = String(solutionText || '').match(new RegExp(`\\[QBP_${key}:([^\\]\\r\\n]+)\\]`, 'i'));
  return match ? match[1] : '';
}

function compactQuestion(question, ownerName) {
  const storedType = legacyValue(question.solution_text, 'TYPE');
  const storedDifficulty = legacyValue(question.solution_text, 'DIFFICULTY');
  return {
    id: question.id,
    subject: question.subject || 'General',
    klass: question.klass || '',
    chapter: question.chapter || 'General',
    topic: question.topic || 'General',
    qType: storedType || question.q_type || 'mcq_single',
    difficulty: question.difficulty || storedDifficulty || 'Medium',
    question: question.question || question.assertion || '',
    correctAnswer: question.num_answer || question.correct_option || '',
    createdAt: question.created_at || null,
    createdBy: question.created_by_name || ownerName || '',
  };
}

// GET /api/dashboard
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [questions, rawUsers] = await Promise.all([
      readAll('questions'),
      readAll('users'),
    ]);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const mondayOffset = (now.getDay() + 6) % 7;
    const week = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    const subjects = new Set();
    const chapters = new Set();
    questions.forEach(question => {
      const rawSubject = String(question.subject || '').trim();
      const subject = rawSubject === 'Maths' ? 'Mathematics' : rawSubject;
      const chapter = String(question.chapter || '').trim();
      if (subject && subject !== 'General') subjects.add(subject);
      if (chapter && chapter !== 'General') {
        chapters.add(`${subject || 'General'}::${chapter}`);
      }
    });

    const users = rawUsers.map(toLogicalUser);
    const byRole = { admin: 0, adder: 0, editor: 0, viewer: 0 };
    users.forEach(user => {
      if (Object.prototype.hasOwnProperty.call(byRole, user.role)) {
        byRole[user.role] += 1;
      }
    });

    const userNamesById = new Map(
      users.filter(user => user.id).map(user => [String(user.id), user.name || user.email || 'Unknown user'])
    );
    const activityMap = new Map();
    questions.forEach(question => {
      const owner = String(
        question.created_by_name ||
        userNamesById.get(String(question.created_by || '')) ||
        ''
      ).trim();
      if (owner) activityMap.set(owner, (activityMap.get(owner) || 0) + 1);
    });
    const mostActiveEntry = [...activityMap.entries()].sort((a, b) => b[1] - a[1])[0];

    const adderStats = users
      .filter(user => user.role === 'adder')
      .map(user => ({
        id: user.id,
        name: user.name || user.email || 'Unnamed Adder',
        email: user.email || '',
        subject: user.subject || 'All',
        questionCount: questions.filter(question => questionBelongsToUser(question, user)).length,
      }))
      .sort((a, b) => b.questionCount - a.questionCount || a.name.localeCompare(b.name));

    // Supply a name when ownership IDs exist but the denormalized name columns do not.
    const displayRows = questions.map(question => ({
      ...question,
      created_by_name: question.created_by_name || userNamesById.get(String(question.created_by || '')) || '',
      updated_by_name: question.updated_by_name || userNamesById.get(String(question.updated_by || '')) || '',
    }));

    res.json({
      totalQuestions: questions.length,
      totalSubjects: subjects.size,
      totalChapters: chapters.size,
      totalAdmins: byRole.admin,
      totalAdders: byRole.adder,
      totalEditors: byRole.editor,
      totalViewers: byRole.viewer,
      totalUsers: users.length,
      questionsToday: questions.filter(q => isOnOrAfter(q.created_at, today)).length,
      questionsWeek: questions.filter(q => isOnOrAfter(q.created_at, week)).length,
      questionsMonth: questions.filter(q => isOnOrAfter(q.created_at, month)).length,
      mostActiveUser: mostActiveEntry
        ? { name: mostActiveEntry[0], count: mostActiveEntry[1] }
        : null,
      recentAdded: recentRows(displayRows, 'created_at'),
      recentEdited: recentRows(displayRows, 'updated_at'),
      adderStats,
      allUsers: users,
    });
  } catch (err) {
    console.error('[dashboard]', err);
    res.status(500).json({ error: 'Failed to load dashboard data.', details: err.message });
  }
});

// GET /api/dashboard/adders/:userId/questions
router.get('/adders/:userId/questions', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [questions, rawUsers] = await Promise.all([
      readAll('questions'),
      readAll('users'),
    ]);
    const user = rawUsers.map(toLogicalUser)
      .find(candidate => String(candidate.id) === String(req.params.userId));

    if (!user || user.role !== 'adder') {
      return res.status(404).json({ error: 'Adder not found.' });
    }

    const ownedQuestions = questions
      .filter(question => questionBelongsToUser(question, user))
      .sort((a, b) => timeValue(b.created_at) - timeValue(a.created_at))
      .map(question => compactQuestion(question, user.name || user.email));

    res.json({
      adder: {
        id: user.id,
        name: user.name || user.email || 'Unnamed Adder',
        email: user.email || '',
        subject: user.subject || 'All',
        questionCount: ownedQuestions.length,
      },
      questions: ownedQuestions,
    });
  } catch (err) {
    console.error('[dashboard adder questions]', err);
    res.status(500).json({ error: 'Failed to load questions added by this user.', details: err.message });
  }
});

module.exports = router;
