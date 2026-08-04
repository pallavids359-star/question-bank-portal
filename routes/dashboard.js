'use strict';
const express  = require('express');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { toLogicalUser } = require('../lib/user-role');

const router = express.Router();

// ── GET /api/dashboard ────────────────────────────────────────────────────
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const week  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
    const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      questionsRes,
      subjectsRes,
      chaptersRes,
      usersRes,
      todayRes,
      weekRes,
      monthRes,
      recentAddedRes,
      recentEditedRes,
    ] = await Promise.all([
      // Total question count
      supabase.from('questions').select('*', { count: 'exact', head: true }),
      // Distinct subjects
      supabase.from('questions').select('subject'),
      // Distinct chapters
      supabase.from('questions').select('chapter'),
      // All users (for role breakdown)
      supabase.from('users').select('id, name, email, role, subject, created_at, last_login'),
      // Questions added today
      supabase.from('questions').select('*', { count: 'exact', head: true }).gte('created_at', today),
      // Questions added this week
      supabase.from('questions').select('*', { count: 'exact', head: true }).gte('created_at', week),
      // Questions added this month
      supabase.from('questions').select('*', { count: 'exact', head: true }).gte('created_at', month),
      // 5 most recently added
      supabase.from('questions')
        .select('id, subject, chapter, topic, q_type, created_at, created_by_name')
        .order('created_at', { ascending: false }).limit(5),
      // 5 most recently edited
      supabase.from('questions')
        .select('id, subject, chapter, topic, q_type, updated_at, updated_by_name')
        .order('updated_at', { ascending: false }).limit(5),
    ]);

    // Compute derived values (filter valid PCMB subjects only)
    const validPCMB = ['Physics', 'Chemistry', 'Mathematics', 'Maths', 'Biology'];
    const rawSubjects = (subjectsRes.data || []).map(q => q.subject).filter(s => s && validPCMB.includes(s));
    const allSubjects = [...new Set(rawSubjects.map(s => (s === 'Maths' ? 'Mathematics' : s)))];
    const allChapters = [...new Set((chaptersRes.data || []).map(q => q.chapter).filter(c => c && c !== 'General'))];

    const users = (usersRes.data || []).map(toLogicalUser);
    const byRole = { admin: 0, adder: 0, editor: 0, viewer: 0 };
    users.forEach(u => { if (byRole[u.role] !== undefined) byRole[u.role]++; });

    // Most active user: find who has the most created questions
    const { data: ownerCounts } = await supabase
      .from('questions')
      .select('created_by_name')
      .not('created_by_name', 'eq', '');

    const activityMap = {};
    (ownerCounts || []).forEach(q => {
      if (q.created_by_name) {
        activityMap[q.created_by_name] = (activityMap[q.created_by_name] || 0) + 1;
      }
    });
    const mostActive = Object.entries(activityMap)
      .sort((a, b) => b[1] - a[1])[0] || null;

    res.json({
      totalQuestions:  questionsRes.count  || 0,
      totalSubjects:   allSubjects.length,
      totalChapters:   allChapters.length,
      totalAdmins:     byRole.admin,
      totalAdders:     byRole.adder,
      totalEditors:    byRole.editor,
      totalViewers:    byRole.viewer,
      totalUsers:      users.length,
      questionsToday:  todayRes.count  || 0,
      questionsWeek:   weekRes.count   || 0,
      questionsMonth:  monthRes.count  || 0,
      mostActiveUser:  mostActive ? { name: mostActive[0], count: mostActive[1] } : null,
      recentAdded:     recentAddedRes.data  || [],
      recentEdited:    recentEditedRes.data || [],
      allUsers:        users,
    });
  } catch (err) {
    console.error('[dashboard]', err);
    res.status(500).json({ error: 'Failed to load dashboard data.', details: err.message });
  }
});

module.exports = router;
