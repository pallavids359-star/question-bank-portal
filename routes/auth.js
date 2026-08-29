'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
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
const {
  requireAuth,
  requireRole
} = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');
const { toLogicalUser } = require('../lib/user-role');
const { getJwtSecret } = require('../lib/config');
const { createRateLimiter } = require('../lib/security');

const router       = express.Router();
const JWT_EXPIRES  = process.env.JWT_EXPIRES_IN || '8h';
const loginRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  key: req => `${req.ip || 'unknown'}:${String(req.body?.email || '').trim().toLowerCase()}`,
});

// ── helpers ────────────────────────────────────────────────────────────────

async function findAuthenticatedUser(req, columns) {
  let lastError = null;

  if (req.user?.userId) {
    const byId = await supabaseControl
      .from('users')
      .select(columns)
      .eq('id', req.user.userId)
      .maybeSingle();

    if (byId.data) return byId;
    lastError = byId.error || lastError;
  }

  const email = String(req.user?.email || '').trim().toLowerCase();
  if (email) {
    const byEmail = await supabaseControl
      .from('users')
      .select(columns)
      .eq('email', email)
      .maybeSingle();

    if (byEmail.data) return byEmail;
    lastError = byEmail.error || lastError;
  }

  return { data: null, error: lastError };
}

async function logLogin(userId, req, status) {
  try {
    const ua = req.headers['user-agent'] || '';
    const { data } = await supabaseControl
      .from('login_history')
      .insert({
        user_id:    userId || null,
        last_activity_at: new Date().toISOString(),
        duration_seconds: 0,
        ip_address: (req.ip || req.connection?.remoteAddress || '').substring(0, 100),
        browser:    ua.substring(0, 255),
        device:     /Mobile|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'Desktop',
        status,
      })
      .select('id')
      .maybeSingle();
    return data;
  } catch (err) {
    return null;
  }
}
// ── Count active login sessions ───────────────────────────────
async function countActiveLoginSessions(userId) {

  if (!userId) return 0;

  // Heartbeat normally updates while the user is active.
  // Sessions with no heartbeat for 3 minutes are treated as stale.
  const cutoff = new Date(
    Date.now() - (3 * 60 * 1000)
  ).toISOString();

  const { count, error } = await supabaseControl
    .from('login_history')
    .select('id', {
      count: 'exact',
      head: true
    })
    .eq('user_id', userId)
    .eq('status', 'success')
    .is('logout_time', null)
    .gte('last_activity_at', cutoff);

  if (error) {
    console.error(
      '[active sessions count]',
      error.message
    );

    return 0;
  }

  return Number(count) || 0;
}

async function closeLoginSession(userId, sessionId) {
  if (!userId || !sessionId) return { closed: false, alreadyClosed: true };

  const now = new Date();
  const { data: session, error: readError } = await supabaseControl
    .from('login_history')
    .select('id, user_id, login_time, logout_time, last_activity_at, duration_seconds')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (readError) throw readError;
  if (!session || session.logout_time) return { closed: false, alreadyClosed: true };

  const previous = new Date(session.last_activity_at || session.login_time || now);
  const rawDelta = Math.max(0, Math.floor((now.getTime() - previous.getTime()) / 1000));
  const durationSeconds = Math.max(0, Number(session.duration_seconds) || 0) + Math.min(rawDelta, 90);
  const { data: closed, error: updateError } = await supabaseControl
    .from('login_history')
    .update({
      logout_time: now.toISOString(),
      last_activity_at: now.toISOString(),
      duration_seconds: durationSeconds,
    })
    .eq('id', session.id)
    .eq('user_id', userId)
    .is('logout_time', null)
    .select('id')
    .maybeSingle();

  if (updateError) throw updateError;
  return { closed: Boolean(closed), alreadyClosed: !closed };
}

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required.'
      });
    }

    const cleanEmail = String(email)
      .toLowerCase()
      .trim();

    const cleanPass = String(password);

    // Find user
    const { data: activeUser, error: userError } = await supabaseControl
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (userError) {
      console.error('[login lookup error]', userError);

      return res.status(500).json({
        error: 'Unable to authenticate user.'
      });
    }

    // Do not reveal whether the email exists
    if (!activeUser) {
      await logLogin(null, req, 'failed').catch(() => {});

      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    // Disabled account
    if (
      activeUser.status === 'disabled' ||
      activeUser.is_active === false
    ) {
      return res.status(403).json({
        error: 'This account has been disabled.'
      });
    }

    // User must have a password hash
    if (!activeUser.password_hash) {
      console.error(
        '[login] Missing password_hash for user:',
        activeUser.id
      );

      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    // Verify password
    let passwordValid = false;

    try {
      passwordValid = await bcrypt.compare(
        cleanPass,
        activeUser.password_hash
      );
    } catch (err) {
      console.error(
        '[password compare error]',
        err
      );

      passwordValid = false;
    }

    // WRONG PASSWORD
    if (!passwordValid) {
      await logLogin(
        activeUser.id,
        req,
        'failed'
      ).catch(() => {});

      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    // Correct password
    const logicalUser = toLogicalUser(activeUser);
    // ============================================================
// LOGIN LIMIT CHECK
// ============================================================

const loginLimit = Math.max(
  0,
  Number.parseInt(
    activeUser.login_limit,
    10
  ) || 0
);

// login_limit = 0 means unlimited
if (loginLimit > 0) {

  const activeSessions =
    await countActiveLoginSessions(
      activeUser.id
    );

  if (activeSessions >= loginLimit) {

    await logLogin(
      activeUser.id,
      req,
      'limit_rejected'
    ).catch(() => {});

    return res.status(403).json({
      error:
        `Login limit reached. This account allows only ${loginLimit} active login${loginLimit === 1 ? '' : 's'}. Please sign out from another device first.`
    });
  }
}

    const loginRecord = await logLogin(
      activeUser.id,
      req,
      'success'
    );
    if (!loginRecord?.id) {
      return res.status(503).json({ error: 'Authentication session service is unavailable.' });
    }

    try {
      await supabaseControl
        .from('users')
        .update({
          last_login: new Date().toISOString()
        })
        .eq('id', activeUser.id);
    } catch (_) {}

    const userSubject =
      logicalUser.subject || 'All';

    const payload = {
      userId: activeUser.id,
      email: activeUser.email,
      name: activeUser.name,
      role: logicalUser.role || 'viewer',
      subject: userSubject,
      loginHistoryId:
        loginRecord?.id || null
    };

    const token = jwt.sign(
      payload,
      getJwtSecret(),
      {
        expiresIn: JWT_EXPIRES
      }
    );

    try {
      await writeAuditLog({
        userId: activeUser.id,
        userName: activeUser.name,
        action: 'LOGIN',
        resourceType: 'auth',
        details: {
          ip: req.ip,
          device:
            /Mobile/i.test(
              req.headers['user-agent'] || ''
            )
              ? 'Mobile'
              : 'Desktop'
        }
      });
    } catch (_) {}

    return res.json({
      token,
      user: {
        id: activeUser.id,
        name: activeUser.name,
        email: activeUser.email,
        role:
          logicalUser.role || 'viewer',
        subject:
          userSubject
      }
    });

  } catch (err) {

    console.error(
      '[login error]',
      err
    );

    return res.status(500).json({
      error: 'Server authentication error.',
      details: err.message
    });
  }
});

// ── POST /api/auth/heartbeat ───────────────────────────────────────────────
// Adds only the short interval since the previous heartbeat. Long gaps are
// capped so an idle/background tab is not counted as active website time.
router.post('/heartbeat', requireAuth, async (req, res) => {
  const sessionId = req.user.loginHistoryId;
  if (!sessionId || !req.user.userId) {
    return res.json({ tracked: false });
  }

  const { data: session, error: readError } = await supabaseControl
    .from('login_history')
    .select('id, user_id, login_time, logout_time, last_activity_at, duration_seconds')
    .eq('id', sessionId)
    .eq('user_id', req.user.userId)
    .maybeSingle();

  if (readError) return res.status(500).json({ error: readError.message });
  if (!session || session.logout_time) return res.json({ tracked: false });

  const now = new Date();
  const previous = new Date(session.last_activity_at || session.login_time || now);
  const rawDelta = Math.max(0, Math.floor((now.getTime() - previous.getTime()) / 1000));
  const activeDelta = Math.min(rawDelta, 90);
  const durationSeconds = Math.max(0, Number(session.duration_seconds) || 0) + activeDelta;

  const { error: updateError } = await supabaseControl
    .from('login_history')
    .update({
      last_activity_at: now.toISOString(),
      duration_seconds: durationSeconds,
    })
    .eq('id', session.id)
    .eq('user_id', req.user.userId);

  if (updateError) return res.status(500).json({ error: updateError.message });
  res.json({ tracked: true, durationSeconds });
});
// ── GET /api/auth/user-time-summary ───────────────────────────
// Admin only
// Returns question contribution + session summary
// for the selected week / month / year.
router.get(
  '/user-time-summary',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {

    try {

      // =========================================================
      // READ DATE RANGE
      // =========================================================

      const startRaw = req.query.start;
      const endRaw   = req.query.end;

      let startDate;
      let endDate;


      if (startRaw) {

        startDate =
          new Date(startRaw);

      } else {

        startDate =
          new Date();

        startDate.setDate(
          startDate.getDate() - 7
        );
      }


      if (endRaw) {

        endDate =
          new Date(endRaw);

      } else {

        endDate =
          new Date();
      }


      if (
        Number.isNaN(
          startDate.getTime()
        ) ||
        Number.isNaN(
          endDate.getTime()
        )
      ) {

        return res.status(400).json({
          error:
            'Invalid start or end date.'
        });

      }


      if (startDate >= endDate) {

        return res.status(400).json({
          error:
            'Start date must be before end date.'
        });

      }



      // =========================================================
      // GET LOGIN SESSIONS
      // =========================================================

      const {
        data: sessions,
        error: sessionError
      } = await supabaseControl
        .from('login_history')
        .select(`
          id,
          user_id,
          status,
          login_time,
          logout_time,
          last_activity_at,
          duration_seconds
        `)
        .eq(
          'status',
          'success'
        )
        .gte(
          'login_time',
          startDate.toISOString()
        )
        .lt(
          'login_time',
          endDate.toISOString()
        );


      if (sessionError) {

        console.error(
          '[user-time-summary sessions]',
          sessionError
        );

        return res.status(500).json({
          error:
            sessionError.message
        });

      }


      const validSessions =
        Array.isArray(sessions)
          ? sessions
          : [];



      // =========================================================
// GET ALL QUESTIONS ADDED DURING SELECTED PERIOD
// =========================================================

const validQuestions = [];

const QUESTION_PAGE_SIZE = 1000;

const isMigratedQuestionShard = question => {
  const subject =
    String(question?.subject || '')
      .trim()
      .toLowerCase();

  const klass =
    String(question?.klass || '')
      .replace(/^class\s*/i, '')
      .trim();

  return (
    ['physics', 'chemistry', 'biology', 'mathematics'].includes(subject) &&
    ['11', '12'].includes(klass)
  );
};

const readPeriodQuestions = async client => {
  const rows = [];

  for (
    let from = 0;
    ;
    from += QUESTION_PAGE_SIZE
  ) {
    const {
      data: questionPage,
      error: questionError
    } = await client
      .from('questions')
      .select(`
        id,
        subject,
        klass,
        created_by,
        created_by_name,
        created_at
      `)
      .gte(
        'created_at',
        startDate.toISOString()
      )
      .lt(
        'created_at',
        endDate.toISOString()
      )
      .order(
        'created_at',
        {
          ascending: true
        }
      )
      .range(
        from,
        from + QUESTION_PAGE_SIZE - 1
      );

    if (questionError) {
      throw questionError;
    }

    const page =
      Array.isArray(questionPage)
        ? questionPage
        : [];

    rows.push(...page);

    if (
      page.length <
      QUESTION_PAGE_SIZE
    ) {
      break;
    }
  }

  return rows;
};

let questionSets;

try {
  questionSets = await Promise.all([
    readPeriodQuestions(supabase),
    readPeriodQuestions(supabasePhysics11),
    readPeriodQuestions(supabasePhysics12),
    readPeriodQuestions(supabaseChemistry11),
    readPeriodQuestions(supabaseChemistry12),
    readPeriodQuestions(supabaseBiology11),
    readPeriodQuestions(supabaseBiology12),
    readPeriodQuestions(supabaseMathematics11),
    readPeriodQuestions(supabaseMathematics12),
  ]);
} catch (questionError) {
  console.error(
    '[user-time-summary questions]',
    questionError
  );

  return res.status(500).json({
    error:
      questionError.message
  });
}

const [
  sourceQuestions,
  physics11Questions,
  physics12Questions,
  chemistry11Questions,
  chemistry12Questions,
  biology11Questions,
  biology12Questions,
  mathematics11Questions,
  mathematics12Questions
] = questionSets;

validQuestions.push(
  ...sourceQuestions.filter(
    question =>
      !isMigratedQuestionShard(question)
  ),
  ...physics11Questions,
  ...physics12Questions,
  ...chemistry11Questions,
  ...chemistry12Questions,
  ...biology11Questions,
  ...biology12Questions,
  ...mathematics11Questions,
  ...mathematics12Questions
);


      // =========================================================
      // GET ALL USERS
      // =========================================================
      //
      // We load all users because:
      //
      // 1. A user may have added questions but have no login
      //    session recorded during this period.
      //
      // 2. Older questions may only contain created_by_name.
      //
      // =========================================================

      const {
        data: users,
        error: usersError
      } = await supabaseControl
        .from('users')
        .select(`
          id,
          name,
          email,
          role,
          subject,
          status
        `);


      if (usersError) {

        console.error(
          '[user-time-summary users]',
          usersError
        );

        return res.status(500).json({
          error:
            usersError.message
        });

      }



      // =========================================================
      // NORMALIZE USERS
      // =========================================================

      const normalizedUsers =
        (users || []).map(user => {

          const logical =
            toLogicalUser(user);

          return {

            id:
              user.id,

            name:
              user.name ||
              user.email ||
              'Unnamed User',

            email:
              user.email || '',

            role:
              logical.role ||
              user.role ||
              'viewer',

            subject:
              logical.subject ||
              user.subject ||
              'All',

            status:
              user.status || 'active'

          };

        });



      // =========================================================
      // USER LOOKUP MAPS
      // =========================================================

      const userMapById =
        new Map();

      const userMapByName =
        new Map();


      normalizedUsers.forEach(user => {

        if (user.id) {

          userMapById.set(
            String(user.id),
            user
          );

        }


        const nameKey =
          String(
            user.name || ''
          )
            .trim()
            .toLowerCase();


        const emailKey =
          String(
            user.email || ''
          )
            .trim()
            .toLowerCase();


        if (nameKey) {

          userMapByName.set(
            nameKey,
            user
          );

        }


        if (emailKey) {

          userMapByName.set(
            emailKey,
            user
          );

        }

      });



      // =========================================================
      // QUESTION COUNT MAP
      // =========================================================

      const questionCountByUser =
        new Map();


      validQuestions.forEach(question => {

        let user = null;


        // -----------------------------------------
        // Normal modern question ownership
        // -----------------------------------------

        if (question.created_by) {

          user =
            userMapById.get(
              String(
                question.created_by
              )
            ) || null;

        }


        // -----------------------------------------
        // Legacy question ownership by name
        // -----------------------------------------

        if (
          !user &&
          question.created_by_name
        ) {

          const ownerKey =
            String(
              question.created_by_name
            )
              .trim()
              .toLowerCase();


          user =
            userMapByName.get(
              ownerKey
            ) || null;

        }


        if (!user || !user.id) {
          return;
        }


        const key =
          String(user.id);


        questionCountByUser.set(
          key,
          (
            questionCountByUser.get(
              key
            ) || 0
          ) + 1
        );

      });



      // =========================================================
      // SESSION SUMMARY MAP
      // =========================================================

      const sessionSummaryByUser =
        new Map();


      validSessions.forEach(session => {

        if (!session.user_id) {
          return;
        }


        const key =
          String(
            session.user_id
          );


        if (
          !sessionSummaryByUser.has(
            key
          )
        ) {

          sessionSummaryByUser.set(
            key,
            {
              sessions: 0,
              totalSeconds: 0,
              lastActiveAt: null
            }
          );

        }


        const row =
          sessionSummaryByUser.get(
            key
          );


        // -----------------------------------------
        // Session count
        // -----------------------------------------

        row.sessions += 1;



        // -----------------------------------------
        // Website duration
        // Kept internally if needed later
        // -----------------------------------------

        const duration =
          Math.max(
            0,
            Number(
              session.duration_seconds
            ) || 0
          );


        row.totalSeconds +=
          duration;



        // -----------------------------------------
        // Last activity
        // -----------------------------------------

        const activityTime =
          session.last_activity_at ||
          session.logout_time ||
          session.login_time ||
          null;


        if (activityTime) {

          const activityDate =
            new Date(
              activityTime
            );


          if (
            !Number.isNaN(
              activityDate.getTime()
            ) &&
            (
              !row.lastActiveAt ||
              activityDate >
                new Date(
                  row.lastActiveAt
                )
            )
          ) {

            row.lastActiveAt =
              activityDate
                .toISOString();

          }

        }

      });



      // =========================================================
      // BUILD FINAL USER DATA
      // =========================================================

      const data =
        normalizedUsers
          .map(user => {

            const key =
              String(user.id);


            const sessionData =
              sessionSummaryByUser.get(
                key
              ) || {
                sessions: 0,
                totalSeconds: 0,
                lastActiveAt: null
              };


            const questionCount =
              questionCountByUser.get(
                key
              ) || 0;


            return {

              id:
                user.id,

              name:
                user.name,

              email:
                user.email,

              role:
                user.role,

              subject:
                user.subject,


              // =====================================
              // MAIN VALUE NOW = QUESTIONS
              // =====================================

              questionCount,


              // =====================================
              // KEEP SESSION INFORMATION
              // =====================================

              sessions:
                sessionData.sessions,

              lastActiveAt:
                sessionData.lastActiveAt,


              // Optional:
              // retained for compatibility,
              // although frontend no longer displays it.
              totalSeconds:
                sessionData.totalSeconds

            };

          })


          // Only display users who either:
          // - added a question
          // - or logged in during this period
          .filter(user => {

            return (
              user.questionCount > 0 ||
              user.sessions > 0
            );

          })


          // Highest question contribution first
          .sort((a, b) => {

            return (
              b.questionCount -
                a.questionCount ||

              b.sessions -
                a.sessions ||

              String(a.name)
                .localeCompare(
                  String(b.name)
                )
            );

          });



      // =========================================================
      // TOTAL QUESTIONS
      // =========================================================

      const totalQuestions =
        validQuestions.length;



      // =========================================================
      // TOTAL SESSIONS
      // =========================================================

      const totalSessions =
        validSessions.length;



      // =========================================================
      // ACTIVE USERS
      // =========================================================
      //
      // A user counts as active for the selected period if
      // they added at least one question OR had a login session.
      //
      // =========================================================

      const activeUsers =
        data.length;



      // =========================================================
      // RESPONSE
      // =========================================================

      return res.json({

        period:
          req.query.period ||
          'week',

        start:
          startDate.toISOString(),

        end:
          endDate.toISOString(),


        // New primary metric
        totalQuestions,


        activeUsers,

        totalSessions,


        // Keep for backward compatibility if old frontend
        // still expects this property anywhere.
        totalSeconds:
          data.reduce(
            (sum, user) =>
              sum +
              (
                Number(
                  user.totalSeconds
                ) || 0
              ),
            0
          ),


        data

      });


    } catch (error) {

      console.error(
        '[user-time-summary]',
        error
      );


      return res.status(500).json({

        error:
          error.message ||
          'Failed to load user summary.'

      });

    }

  }
);
// ── POST /api/auth/logout ──────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await closeLoginSession(req.user.userId, req.user.loginHistoryId);
  } catch (error) {
    console.error('[logout session close]', error.message);
    return res.status(503).json({ error: 'Unable to close this login session. Please try signing out again.' });
  }

  await writeAuditLog({
    userId: req.user.userId, userName: req.user.name,
    action: 'LOGOUT', resourceType: 'auth', details: {},
  }).catch(() => {});

  res.json({ message: 'Logged out successfully.' });
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const { data: user, error } = await findAuthenticatedUser(
    req,
    'id, name, email, role, subject, status, last_login, created_at'
  );

  if (error || !user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  res.json(toLogicalUser(user));
});
// ── ADMIN: UPDATE USER LOGIN LIMIT ─────────────────────────────
router.put(
  '/login-limit/:userId',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {

    try {

      const loginLimit =
        Number.parseInt(
          req.body?.loginLimit,
          10
        );

      if (
        !Number.isInteger(loginLimit) ||
        loginLimit < 0
      ) {
        return res.status(400).json({
          error:
            'Login limit must be 0 or a positive whole number.'
        });
      }

      const { data: user, error: findError } =
        await supabaseControl
          .from('users')
          .select(
            'id, name, email, login_limit'
          )
          .eq(
            'id',
            req.params.userId
          )
          .maybeSingle();

      if(findError){
        return res.status(500).json({
          error:findError.message
        });
      }

      if(!user){
        return res.status(404).json({
          error:'User not found.'
        });
      }


      const { data, error } =
        await supabaseControl
          .from('users')
          .update({
            login_limit:loginLimit
          })
          .eq(
            'id',
            req.params.userId
          )
          .select(
            'id, name, email, login_limit'
          )
          .single();

      if(error){
        return res.status(400).json({
          error:error.message
        });
      }


      await writeAuditLog({

        userId:req.user.userId,

        userName:
          req.user.name || 'Admin',

        action:
          'UPDATE_LOGIN_LIMIT',

        resourceType:
          'user',

        resourceId:
          data.id,

        details:{
          email:data.email,
          loginLimit
        }

      }).catch(()=>{});


      res.json({
        success:true,
        id:data.id,
        email:data.email,
        loginLimit:data.login_limit
      });

    }catch(error){

      console.error(
        '[update login limit]',
        error
      );

      res.status(500).json({
        error:error.message
      });
    }
  }
);

// ── PUT /api/auth/change-password ─────────────────────────────────────────
router.put('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const { data: user, error } = await findAuthenticatedUser(
    req,
    'id, name, email, password_hash'
  );

  if (error || !user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  const { error: updateError } = await supabaseControl
    .from('users')
    .update({ password_hash: newHash })
    .eq('id', user.id);

  if (updateError) {
    return res.status(500).json({ error: 'Failed to update password.' });
  }

  await writeAuditLog({
    userId: user.id, userName: user.name || req.user.name,
    action: 'CHANGE_PASSWORD', resourceType: 'user',
    resourceId: user.id, details: {},
  });

  res.json({ message: 'Password changed successfully.' });
});

module.exports = router;
