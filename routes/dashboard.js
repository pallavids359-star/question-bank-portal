'use strict';
const express  = require('express');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { toLogicalUser } = require('../lib/user-role');

const router = express.Router();
const PAGE_SIZE = 1000;

// Read every real row without naming optional columns. Older installations may
// not yet have ownership/difficulty fields, but the dashboard must still load.
async function readAll(table, columns = '*') {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
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

async function readRecentQuestions(field) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, subject, klass, chapter, topic, q_type, created_at, updated_at, created_by_name, updated_by_name')
    .not(field, 'is', null)
    .order(field, { ascending: false })
    .limit(5);
  if (error) throw error;
  return data || [];
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

function sessionDurationSeconds(session, nowMs) {
  let seconds = Math.max(0, Number(session.duration_seconds) || 0);
  const loginMs = timeValue(session.login_time);
  const logoutMs = timeValue(session.logout_time);
  const activityMs = timeValue(session.last_activity_at);

  // Preserve useful duration for sessions recorded before heartbeat tracking.
  if (seconds === 0 && loginMs && logoutMs > loginMs) {
    seconds = Math.min(Math.floor((logoutMs - loginMs) / 1000), 24 * 60 * 60);
  }

  if (!logoutMs && activityMs && nowMs - activityMs <= 120000) {
    seconds += Math.min(Math.max(0, Math.floor((nowMs - activityMs) / 1000)), 90);
  }
  return seconds;
}

function buildUserTimeStats(
  users,
  sessions,
  questions,
  now
) {

  const nowMs =
    now.getTime();

  const todayStartDate =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

  const todayStart =
    todayStartDate.getTime();

  const sessionsByUser =
    new Map();


  sessions.forEach(session => {

    if(
      !session.user_id ||
      session.status !== 'success'
    ){
      return;
    }

    const key =
      String(session.user_id);

    if(!sessionsByUser.has(key)){
      sessionsByUser.set(key, []);
    }

    sessionsByUser
      .get(key)
      .push(session);

  });


  return users
    .map(user => {

      const userSessions =
        sessionsByUser.get(
          String(user.id)
        ) || [];


      // Number of questions added TODAY
      const questionsToday =
        questions.filter(question => {

          return (
            questionBelongsToUser(
              question,
              user
            ) &&
            isOnOrAfter(
              question.created_at,
              todayStartDate
            )
          );

        }).length;


      let totalSeconds = 0;
      let todaySeconds = 0;
      let lastSeenMs = 0;
      let online = false;


      userSessions.forEach(session => {

        const duration =
          sessionDurationSeconds(
            session,
            nowMs
          );

        const lastMs =
          timeValue(
            session.last_activity_at
          ) ||
          timeValue(
            session.logout_time
          ) ||
          timeValue(
            session.login_time
          );


        totalSeconds += duration;


        if(lastMs >= todayStart){
          todaySeconds += duration;
        }


        lastSeenMs =
          Math.max(
            lastSeenMs,
            lastMs
          );


        if(
          !session.logout_time &&
          timeValue(
            session.last_activity_at
          ) &&
          nowMs -
            timeValue(
              session.last_activity_at
            ) <= 120000
        ){
          online = true;
        }

      });


      return {

        id: user.id,

        name:
          user.name ||
          user.email ||
          'Unnamed User',

        email:
          user.email || '',

        role:
          user.role || 'viewer',

        subject:
          user.subject || 'All',

        questionsToday,

        totalSeconds,

        todaySeconds,

        sessionsCount:
          userSessions.length,

        lastSeen:
          lastSeenMs
            ? new Date(
                lastSeenMs
              ).toISOString()
            : null,

        online
      };

    })
    .sort(
      (a,b) =>
        b.totalSeconds -
          a.totalSeconds ||
        a.name.localeCompare(
          b.name
        )
    );
}

// Fast endpoint so Recently Added/Edited does not wait for the full analytics scan.
router.get('/recent', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [recentAdded, recentEdited] = await Promise.all([
      readRecentQuestions('created_at'),
      readRecentQuestions('updated_at'),
    ]);
    res.json({ recentAdded, recentEdited });
  } catch (error) {
    console.error('[dashboard recent]', error.message);
    res.status(500).json({ error: 'Failed to load recent questions.' });
  }
});

// GET /api/dashboard
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const [questions, rawUsers, loginSessions] = await Promise.all([
      readAll('questions', 'id, subject, klass, chapter, topic, q_type, created_at, updated_at, created_by, created_by_name, updated_by, updated_by_name'),
      readAll('users', 'id, name, email, role, subject, status'),
      readAll('login_history', 'user_id, status, login_time, logout_time, last_activity_at, duration_seconds'),
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
    const contributionCountsById = new Map();
    const contributionCountsByName = new Map();
    questions.forEach(question => {
      const owner = String(
        question.created_by_name ||
        userNamesById.get(String(question.created_by || '')) ||
        ''
      ).trim();
      if (owner) activityMap.set(owner, (activityMap.get(owner) || 0) + 1);
      if (question.created_by) {
        const key = String(question.created_by);
        contributionCountsById.set(key, (contributionCountsById.get(key) || 0) + 1);
      }
      if (question.created_by_name) {
        const key = String(question.created_by_name).trim().toLowerCase();
        contributionCountsByName.set(key, (contributionCountsByName.get(key) || 0) + 1);
      }
    });
    const mostActiveEntry = [...activityMap.entries()].sort((a, b) => b[1] - a[1])[0];

   const adderStats = users
  .filter(
    user =>
      user.role === 'adder' ||
      user.role === 'admin'
  )
  .map(user => {

    const questionCount =
      questions.filter(question =>
        questionBelongsToUser(
          question,
          user
        )
      ).length;

    return {

      id:
        user.id,

      name:
        user.name ||
        user.email ||
        'Unnamed Contributor',

      email:
        user.email || '',

      role:
        user.role,

      subject:
        user.subject || 'All',

      questionCount

    };

  })
  .filter(
    user =>
      user.questionCount > 0
  )
  .sort(
    (a, b) =>
      b.questionCount -
        a.questionCount ||
      a.name.localeCompare(
        b.name
      )
  );
    const userTimeStats = buildUserTimeStats(
  users,
  loginSessions,
  questions,
  now
);
    // Supply a name when ownership IDs exist but the denormalized name columns do not.
    const displayRows = questions.map(question => ({
      ...question,
      created_by_name: question.created_by_name || userNamesById.get(String(question.created_by || '')) || '',
      updated_by_name: question.updated_by_name || userNamesById.get(String(question.updated_by || '')) || '',
    }));
// ============================================================
// SUBJECT -> CLASS -> CHAPTER -> CONCEPT QUESTION COUNTS
// ============================================================

const questionDistribution = {};

questions.forEach(question => {

  const subject = String(
    question.subject || 'General'
  ).trim();

  const klass = String(
    question.klass || 'General'
  ).replace(/^class\s*/i, '').trim() || 'General';

  const chapter = String(
    question.chapter || 'General'
  ).trim();

  const concept = String(
    question.topic || 'General'
  ).trim();

  if (!questionDistribution[subject]) {
    questionDistribution[subject] = {
      questionCount: 0,
      classes: {}
    };
  }

  // Subject total
  questionDistribution[subject].questionCount += 1;

  if (!questionDistribution[subject].classes[klass]) {
    questionDistribution[subject].classes[klass] = {
      questionCount: 0,
      chapters: {}
    };
  }

  questionDistribution[subject]
    .classes[klass]
    .questionCount += 1;

  if (!questionDistribution[subject].classes[klass].chapters[chapter]) {
    questionDistribution[subject].classes[klass].chapters[chapter] = {
      questionCount: 0,
      concepts: {}
    };
  }

  // Chapter total
  questionDistribution[subject]
    .classes[klass]
    .chapters[chapter]
    .questionCount += 1;

  if (
    !questionDistribution[subject]
      .classes[klass]
      .chapters[chapter]
      .concepts[concept]
  ) {
    questionDistribution[subject]
      .classes[klass]
      .chapters[chapter]
      .concepts[concept] = 0;
  }

  // Concept total
  questionDistribution[subject]
    .classes[klass]
    .chapters[chapter]
    .concepts[concept] += 1;
});
    res.json({
      totalQuestions: questions.length,
      totalSubjects: subjects.size,
      totalChapters: chapters.size,
      questionDistribution,
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
      userTimeStats,
      allUsers: users,
    });
  } catch (err) {
    console.error('[dashboard]', err);
    res.status(500).json({ error: 'Failed to load dashboard data.', details: err.message });
  }
});

// GET /api/dashboard/adders/:userId/questions
// Kept at the original URL for compatibility, but supports both Adders and
// Admins who have created questions.
router.get('/adders/:userId/questions', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const rawUsers = await readAll('users', 'id, name, email, role, subject, status');
    const user = rawUsers.map(toLogicalUser)
      .find(candidate => String(candidate.id) === String(req.params.userId));

    if (!user || !['adder', 'admin'].includes(user.role)) {
      return res.status(404).json({ error: 'Question contributor not found.' });
    }

    const questionColumns = 'id, subject, klass, chapter, topic, q_type, question, solution_text, num_answer, correct_option, created_at, created_by, created_by_name';
    let questions = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('questions')
        .select(questionColumns)
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const page = data || [];
      questions.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    // Compatibility for older rows that stored only the contributor name.
    if (!questions.length && user.name) {
      const legacy = await supabase
        .from('questions')
        .select(questionColumns)
        .eq('created_by_name', user.name)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (legacy.error) throw legacy.error;
      questions = legacy.data || [];
    }

    const ownedQuestions = questions
      .map(question => compactQuestion(question, user.name || user.email));

    res.json({
      adder: {
        id: user.id,
        name: user.name || user.email || 'Unnamed Contributor',
        email: user.email || '',
        role: user.role,
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
