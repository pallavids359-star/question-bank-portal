'use strict';
const express  = require('express');
const supabase = require('../lib/supabase');
const supabaseControl = require('../lib/supabase-control');
const supabasePhysics11 = require('../lib/supabase-physics-11');
const supabasePhysics12 = require('../lib/supabase-physics-12');
const supabaseChemistry11 = require('../lib/supabase-chemistry-11');
const supabaseChemistry12 = require('../lib/supabase-chemistry-12');
const supabaseBiology11 = require('../lib/supabase-biology-11');
const supabaseBiology12 = require('../lib/supabase-biology-12');
const supabaseMathematics11 = require('../lib/supabase-mathematics-11');
const supabaseMathematics12 = require('../lib/supabase-mathematics-12');
const { requireAuth, requireRole } = require('../middleware/auth');
const { toLogicalUser } = require('../lib/user-role');

const router = express.Router();
const PAGE_SIZE = 1000;
let dashboardAggregatesSupported = true;

// Read every real row without naming optional columns. Older installations may
// not yet have ownership/difficulty fields, but the dashboard must still load.
async function readAll(table, columns = '*', client = supabase) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
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

function normalizedQuestionClass(klass) {
  return String(klass || '')
    .replace(/^class\s*/i, '')
    .trim();
}

function isMigratedQuestionShard(subject, klass) {
  const normalizedSubject =
    String(subject || '').trim().toLowerCase();

  const normalizedClass =
    normalizedQuestionClass(klass);

  return ['physics', 'chemistry', 'biology', 'mathematics'].includes(normalizedSubject)
    && ['11', '12'].includes(normalizedClass);
}

const MIGRATED_QUESTION_CLIENTS = [
  supabasePhysics11,
  supabasePhysics12,
  supabaseChemistry11,
  supabaseChemistry12,
  supabaseBiology11,
  supabaseBiology12,
  supabaseMathematics11,
  supabaseMathematics12,
];

async function readAllSince(
  table,
  columns,
  field,
  cutoff,
  client = supabase
) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .gte(field, cutoff.toISOString())
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`${table}: ${error.message}`);

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function countRows(
  table,
  applyFilters,
  client = supabase
) {
  let query = client
    .from(table)
    .select('id', { count: 'exact', head: true });

  if (applyFilters) {
    query = applyFilters(query);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  return Number(count) || 0;
}

async function countEffectiveQuestions(applyFilters) {
  const sourceShardFilter = (subject, klass) => query => {
    let filtered = applyFilters
      ? applyFilters(query)
      : query;

    return filtered
      .eq('subject', subject)
      .in('klass', [klass, `Class ${klass}`]);
  };

  const [
    sourceTotal,
    sourcePhysics11,
    sourcePhysics12,
    sourceChemistry11,
    sourceChemistry12,
    sourceBiology11,
    sourceBiology12,
    sourceMathematics11,
    sourceMathematics12,
    shardPhysics11,
    shardPhysics12,
    shardChemistry11,
    shardChemistry12,
    shardBiology11,
    shardBiology12,
    shardMathematics11,
    shardMathematics12
  ] = await Promise.all([
    countRows('questions', applyFilters, supabase),

    countRows('questions', sourceShardFilter('Physics', '11'), supabase),
    countRows('questions', sourceShardFilter('Physics', '12'), supabase),
    countRows('questions', sourceShardFilter('Chemistry', '11'), supabase),
    countRows('questions', sourceShardFilter('Chemistry', '12'), supabase),
    countRows('questions', sourceShardFilter('Biology', '11'), supabase),
    countRows('questions', sourceShardFilter('Biology', '12'), supabase),
    countRows('questions', sourceShardFilter('Mathematics', '11'), supabase),
    countRows('questions', sourceShardFilter('Mathematics', '12'), supabase),

    countRows('questions', applyFilters, supabasePhysics11),
    countRows('questions', applyFilters, supabasePhysics12),
    countRows('questions', applyFilters, supabaseChemistry11),
    countRows('questions', applyFilters, supabaseChemistry12),
    countRows('questions', applyFilters, supabaseBiology11),
    countRows('questions', applyFilters, supabaseBiology12),
    countRows('questions', applyFilters, supabaseMathematics11),
    countRows('questions', applyFilters, supabaseMathematics12),
  ]);

  return (
    Math.max(
      0,
      sourceTotal
        - sourcePhysics11
        - sourcePhysics12
        - sourceChemistry11
        - sourceChemistry12
        - sourceBiology11
        - sourceBiology12
        - sourceMathematics11
        - sourceMathematics12
    )
    + shardPhysics11
    + shardPhysics12
    + shardChemistry11
    + shardChemistry12
    + shardBiology11
    + shardBiology12
    + shardMathematics11
    + shardMathematics12
  );
}

async function readAllGroupedQuestions(
  columns,
  orderColumns,
  client = supabase
) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = client
      .from('questions')
      .select(columns);

    orderColumns.forEach(column => {
      query = query.order(column, {
        ascending: true,
        nullsFirst: true
      });
    });

    const { data, error } =
      await query.range(
        from,
        from + PAGE_SIZE - 1
      );

    if (error) throw error;

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

function groupQuestionRows(rows) {
  const distributionMap = new Map();
  const contributionMap = new Map();

  rows.forEach(question => {
    const distributionKey = JSON.stringify([
      question.subject,
      question.klass,
      question.chapter,
      question.topic,
    ]);
    const distribution = distributionMap.get(distributionKey);
    if (distribution) {
      distribution.questionCount += 1;
    } else {
      distributionMap.set(distributionKey, {
        subject: question.subject,
        klass: question.klass,
        chapter: question.chapter,
        topic: question.topic,
        questionCount: 1,
      });
    }

    const contributionKey = JSON.stringify([
      question.created_by,
      question.created_by_name,
    ]);
    const contribution = contributionMap.get(contributionKey);
    if (contribution) {
      contribution.questionCount += 1;
    } else {
      contributionMap.set(contributionKey, {
        created_by: question.created_by,
        created_by_name: question.created_by_name,
        questionCount: 1,
      });
    }
  });

  return {
    distributionRows: [...distributionMap.values()],
    contributionRows: [...contributionMap.values()],
  };
}

async function readDashboardQuestionGroups() {
  const distributionColumns =
    'subject, klass, chapter, topic, question_count:id.count()';

  const contributionColumns =
    'subject, klass, created_by, created_by_name, question_count:id.count()';

  if (dashboardAggregatesSupported) {
    try {
      const tasks = [
        readAllGroupedQuestions(
          distributionColumns,
          ['subject', 'klass', 'chapter', 'topic'],
          supabase
        ),

        readAllGroupedQuestions(
          contributionColumns,
          [
            'subject',
            'klass',
            'created_by',
            'created_by_name'
          ],
          supabase
        ),
      ];

      for (const client of MIGRATED_QUESTION_CLIENTS) {
        tasks.push(
          readAllGroupedQuestions(
            distributionColumns,
            ['subject', 'klass', 'chapter', 'topic'],
            client
          )
        );

        tasks.push(
          readAllGroupedQuestions(
            contributionColumns,
            [
              'subject',
              'klass',
              'created_by',
              'created_by_name'
            ],
            client
          )
        );
      }

      const [
        sourceDistribution,
        sourceContributions,
        ...shardResults
      ] = await Promise.all(tasks);

      const shardDistribution = [];
      const shardContributions = [];

      for (
        let index = 0;
        index < shardResults.length;
        index += 2
      ) {
        shardDistribution.push(
          ...(shardResults[index] || [])
        );

        shardContributions.push(
          ...(shardResults[index + 1] || [])
        );
      }

      const distributionRows = [
        ...sourceDistribution.filter(
          row =>
            !isMigratedQuestionShard(
              row.subject,
              row.klass
            )
        ),
        ...shardDistribution,
      ].map(row => ({
        ...row,
        questionCount:
          Number(row.question_count) || 0,
      }));

      const contributionMap = new Map();

      const contributionRowsRaw = [
        ...sourceContributions.filter(
          row =>
            !isMigratedQuestionShard(
              row.subject,
              row.klass
            )
        ),
        ...shardContributions,
      ];

      contributionRowsRaw.forEach(row => {
        const key = JSON.stringify([
          row.created_by || null,
          row.created_by_name || null
        ]);

        const count =
          Number(row.question_count) || 0;

        const existing =
          contributionMap.get(key);

        if (existing) {
          existing.questionCount += count;
        } else {
          contributionMap.set(key, {
            created_by:
              row.created_by || null,

            created_by_name:
              row.created_by_name || null,

            questionCount: count,
          });
        }
      });

      return {
        distributionRows,
        contributionRows:
          [...contributionMap.values()],
      };
    } catch (error) {
      dashboardAggregatesSupported = false;

      console.warn(
        '[dashboard] PostgREST aggregates unavailable; using compatibility reader:',
        error.message
      );
    }
  }

  const [
    sourceRows,
    ...shardRowSets
  ] = await Promise.all([
    readAll(
      'questions',
      'subject, klass, chapter, topic, created_by, created_by_name',
      supabase
    ),

    ...MIGRATED_QUESTION_CLIENTS.map(
      client =>
        readAll(
          'questions',
          'subject, klass, chapter, topic, created_by, created_by_name',
          client
        )
    ),
  ]);

  return groupQuestionRows([
    ...sourceRows.filter(
      row =>
        !isMigratedQuestionShard(
          row.subject,
          row.klass
        )
    ),
    ...shardRowSets.flat(),
  ]);
}

function timeValue(value) {
  const valueAsTime = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(valueAsTime) ? valueAsTime : 0;
}

async function readRecentFromClient(
  client,
  field,
  columns
) {
  const { data, error } = await client
    .from('questions')
    .select(columns)
    .not(field, 'is', null)
    .order(field, { ascending: false })
    .limit(5);

  if (error) throw error;

  return data || [];
}

function mergeRecentQuestionRows(
  sourceRows,
  shardRowSets,
  field
) {
  const rowsById = new Map();

  sourceRows
    .filter(
      row =>
        !isMigratedQuestionShard(
          row.subject,
          row.klass
        )
    )
    .forEach(row => {
      rowsById.set(
        String(row.id),
        row
      );
    });

  shardRowSets.flat().forEach(row => {
    rowsById.set(
      String(row.id),
      row
    );
  });

  return [...rowsById.values()]
    .sort(
      (a, b) =>
        timeValue(b[field]) -
        timeValue(a[field])
    )
    .slice(0, 5);
}

async function readRecentQuestions(field) {
  const columns =
    'id, subject, klass, chapter, topic, q_type, created_at, updated_at, created_by_name, updated_by_name';

  const [
    sourceRows,
    ...shardRows
  ] = await Promise.all([
    readRecentFromClient(
      supabase,
      field,
      columns
    ),

    ...MIGRATED_QUESTION_CLIENTS.map(
      client =>
        readRecentFromClient(
          client,
          field,
          columns
        )
    ),
  ]);

  return mergeRecentQuestionRows(
    sourceRows,
    shardRows,
    field
  );
}

async function readRecentDashboardQuestions(field) {
  const columns =
    'id, subject, klass, chapter, topic, q_type, created_at, updated_at, created_by, created_by_name, updated_by, updated_by_name';

  const [
    sourceRows,
    ...shardRows
  ] = await Promise.all([
    readRecentFromClient(
      supabase,
      field,
      columns
    ),

    ...MIGRATED_QUESTION_CLIENTS.map(
      client =>
        readRecentFromClient(
          client,
          field,
          columns
        )
    ),
  ]);

  return mergeRecentQuestionRows(
    sourceRows,
    shardRows,
    field
  );
}

async function readEffectiveQuestionsSince(
  columns,
  field,
  cutoff
) {
  const [
    sourceRows,
    ...shardRows
  ] = await Promise.all([
    readAllSince(
      'questions',
      columns,
      field,
      cutoff,
      supabase
    ),

    ...MIGRATED_QUESTION_CLIENTS.map(
      client =>
        readAllSince(
          'questions',
          columns,
          field,
          cutoff,
          client
        )
    ),
  ]);

  return [
    ...sourceRows.filter(
      row =>
        !isMigratedQuestionShard(
          row.subject,
          row.klass
        )
    ),
    ...shardRows.flat(),
  ];
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
  questionsTodayRows,
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
        questionsTodayRows.filter(question => {

          return (
            questionBelongsToUser(
              question,
              user
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
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const mondayOffset = (now.getDay() + 6) % 7;
    const week = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      questionGroups,
      rawUsers,
      loginSessions,
      totalQuestions,
      questionsWeek,
      questionsMonth,
      questionsTodayRows,
      recentAddedRows,
      recentEditedRows,
    ] = await Promise.all([
      readDashboardQuestionGroups(),
      readAll('users', 'id, name, email, role, subject, status', supabaseControl),
      readAll('login_history', 'user_id, status, login_time, logout_time, last_activity_at, duration_seconds', supabaseControl),
      countEffectiveQuestions(),
      countEffectiveQuestions(
        query =>
          query.gte(
            'created_at',
            week.toISOString()
          )
      ),
      countEffectiveQuestions(
        query =>
          query.gte(
            'created_at',
            month.toISOString()
          )
      ),
      readEffectiveQuestionsSince(
        'subject, klass, created_by, created_by_name, created_at',
        'created_at',
        today
      ),
      readRecentDashboardQuestions('created_at'),
      readRecentDashboardQuestions('updated_at'),
    ]);

    const subjects = new Set();
    const chapters = new Set();
    questionGroups.distributionRows.forEach(question => {
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
    questionGroups.contributionRows.forEach(question => {
      const questionCount = Number(question.questionCount) || 0;
      const owner = String(
        question.created_by_name ||
        userNamesById.get(String(question.created_by || '')) ||
        ''
      ).trim();
      if (owner) activityMap.set(owner, (activityMap.get(owner) || 0) + questionCount);
      if (question.created_by) {
        const key = String(question.created_by);
        contributionCountsById.set(key, (contributionCountsById.get(key) || 0) + questionCount);
      }
      if (question.created_by_name) {
        const key = String(question.created_by_name).trim().toLowerCase();
        contributionCountsByName.set(key, (contributionCountsByName.get(key) || 0) + questionCount);
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
      questionGroups.contributionRows.reduce(
        (total, question) =>
          questionBelongsToUser(question, user)
            ? total + (Number(question.questionCount) || 0)
            : total,
        0
      );

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
  questionsTodayRows,
  now
);
    // Supply a name when ownership IDs exist but the denormalized name columns do not.
    const recentAdded = recentAddedRows.map(question => ({
      ...question,
      created_by_name: question.created_by_name || userNamesById.get(String(question.created_by || '')) || '',
      updated_by_name: question.updated_by_name || userNamesById.get(String(question.updated_by || '')) || '',
    }));
    const recentEdited = recentEditedRows.map(question => ({
      ...question,
      created_by_name: question.created_by_name || userNamesById.get(String(question.created_by || '')) || '',
      updated_by_name: question.updated_by_name || userNamesById.get(String(question.updated_by || '')) || '',
    }));
// ============================================================
// SUBJECT -> CLASS -> CHAPTER -> CONCEPT QUESTION COUNTS
// ============================================================

const questionDistribution = {};

questionGroups.distributionRows.forEach(question => {

  const groupedQuestionCount =
    Number(question.questionCount) || 0;

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
  questionDistribution[subject].questionCount += groupedQuestionCount;

  if (!questionDistribution[subject].classes[klass]) {
    questionDistribution[subject].classes[klass] = {
      questionCount: 0,
      chapters: {}
    };
  }

  questionDistribution[subject]
    .classes[klass]
    .questionCount += groupedQuestionCount;

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
    .questionCount += groupedQuestionCount;

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
    .concepts[concept] += groupedQuestionCount;
});
    res.json({
      totalQuestions,
      totalSubjects: subjects.size,
      totalChapters: chapters.size,
      questionDistribution,
      totalAdmins: byRole.admin,
      totalAdders: byRole.adder,
      totalEditors: byRole.editor,
      totalViewers: byRole.viewer,
      totalUsers: users.length,
      questionsToday: questionsTodayRows.length,
      questionsWeek,
      questionsMonth,
      mostActiveUser: mostActiveEntry
        ? { name: mostActiveEntry[0], count: mostActiveEntry[1] }
        : null,
      recentAdded,
      recentEdited,
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
    const rawUsers = await readAll(
      'users',
      'id, name, email, role, subject, status',
      supabaseControl
    );

    const user = rawUsers
      .map(toLogicalUser)
      .find(
        candidate =>
          String(candidate.id) ===
          String(req.params.userId)
      );

    if (
      !user ||
      !['adder', 'admin'].includes(user.role)
    ) {
      return res.status(404).json({
        error: 'Question contributor not found.'
      });
    }

    const questionColumns =
      'id, subject, klass, chapter, topic, q_type, question, solution_text, num_answer, correct_option, created_at, created_by, created_by_name';

    const readOwned = async (
      client,
      field,
      value
    ) => {
      const rows = [];

      for (
        let from = 0;
        ;
        from += PAGE_SIZE
      ) {
        const { data, error } =
          await client
            .from('questions')
            .select(questionColumns)
            .eq(field, value)
            .order(
              'created_at',
              { ascending: false }
            )
            .range(
              from,
              from + PAGE_SIZE - 1
            );

        if (error) throw error;

        const page = data || [];
        rows.push(...page);

        if (page.length < PAGE_SIZE) {
          break;
        }
      }

      return rows;
    };

    const [
      sourceById,
      ...shardByIdSets
    ] = await Promise.all([
      readOwned(
        supabase,
        'created_by',
        user.id
      ),

      ...MIGRATED_QUESTION_CLIENTS.map(
        client =>
          readOwned(
            client,
            'created_by',
            user.id
          )
      ),
    ]);

    let questions = [
      ...sourceById.filter(
        question =>
          !isMigratedQuestionShard(
            question.subject,
            question.klass
          )
      ),

      ...shardByIdSets.flat(),
    ];

    // Compatibility for historical rows that stored
    // only the contributor name.
    if (!questions.length && user.name) {
      const [
        sourceLegacy,
        ...shardLegacySets
      ] = await Promise.all([
        readOwned(
          supabase,
          'created_by_name',
          user.name
        ),

        ...MIGRATED_QUESTION_CLIENTS.map(
          client =>
            readOwned(
              client,
              'created_by_name',
              user.name
            )
        ),
      ]);

      questions = [
        ...sourceLegacy.filter(
          question =>
            !isMigratedQuestionShard(
              question.subject,
              question.klass
            )
        ),

        ...shardLegacySets.flat(),
      ];
    }

    const uniqueQuestions =
      new Map();

    questions.forEach(question => {
      uniqueQuestions.set(
        String(question.id),
        question
      );
    });

    questions =
      [...uniqueQuestions.values()]
        .sort(
          (a, b) =>
            timeValue(b.created_at) -
            timeValue(a.created_at)
        );

    const ownedQuestions =
      questions.map(
        question =>
          compactQuestion(
            question,
            user.name || user.email
          )
      );

    res.json({
      adder: {
        id: user.id,
        name:
          user.name ||
          user.email ||
          'Unnamed Contributor',
        email: user.email || '',
        role: user.role,
        subject: user.subject || 'All',
        questionCount:
          ownedQuestions.length,
      },

      questions:
        ownedQuestions,
    });
  } catch (err) {
    console.error(
      '[dashboard adder questions]',
      err
    );

    res.status(500).json({
      error:
        'Failed to load questions added by this user.',
      details:
        err.message
    });
  }
});

module.exports = router;
