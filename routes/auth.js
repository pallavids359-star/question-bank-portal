'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const supabase = require('../lib/supabase');
const {
  requireAuth,
  requireRole
} = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');
const { toLogicalUser } = require('../lib/user-role');

const router       = express.Router();
const JWT_SECRET   = process.env.JWT_SECRET || 'manchester-tech-question-bank-portal-super-secret-jwt-key-2026';
const JWT_EXPIRES  = process.env.JWT_EXPIRES_IN || '8h';

// ── helpers ────────────────────────────────────────────────────────────────

async function findAuthenticatedUser(req, columns) {
  let lastError = null;

  if (req.user?.userId) {
    const byId = await supabase
      .from('users')
      .select(columns)
      .eq('id', req.user.userId)
      .maybeSingle();

    if (byId.data) return byId;
    lastError = byId.error || lastError;
  }

  const email = String(req.user?.email || '').trim().toLowerCase();
  if (email) {
    const byEmail = await supabase
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
    const { data } = await supabase
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

  const { count, error } = await supabase
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

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', async (req, res) => {
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
    const { data: activeUser, error: userError } = await supabase
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

    try {
      await supabase
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
      JWT_SECRET,
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

  const { data: session, error: readError } = await supabase
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

  const { error: updateError } = await supabase
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

// ── POST /api/auth/logout ──────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  if (req.user.loginHistoryId) {
    const now = new Date();
    const { data: session } = await supabase
      .from('login_history')
      .select('id, user_id, login_time, last_activity_at, duration_seconds')
      .eq('id', req.user.loginHistoryId)
      .eq('user_id', req.user.userId)
      .maybeSingle();

    if (session) {
      const previous = new Date(session.last_activity_at || session.login_time || now);
      const rawDelta = Math.max(0, Math.floor((now.getTime() - previous.getTime()) / 1000));
      const durationSeconds = Math.max(0, Number(session.duration_seconds) || 0) + Math.min(rawDelta, 90);
      await supabase
        .from('login_history')
        .update({
          logout_time: now.toISOString(),
          last_activity_at: now.toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq('id', session.id);
    }
  }

  await writeAuditLog({
    userId: req.user.userId, userName: req.user.name,
    action: 'LOGOUT', resourceType: 'auth', details: {},
  });

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
        await supabase
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
        await supabase
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
  const { error: updateError } = await supabase
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
