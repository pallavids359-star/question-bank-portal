require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');

// ── Supabase client ─────────────────────────────────────────────────────────
let supabase;
try {
  supabase = require('./lib/supabase');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// ── Route modules ───────────────────────────────────────────────────────────
const questionRoutes  = require('./routes/questions');
const authRoutes      = require('./routes/auth');
const usersRoutes     = require('./routes/users');
const dashboardRoutes = require('./routes/dashboard');
const auditRoutes     = require('./routes/audit');
const settingsRoutes  = require('./routes/settings');

// ── Admin seeder ─────────────────────────────────────────────────────────────
const seedAdmin = require('./lib/seed-admin');

// ── App configuration ────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 4000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(v => v.trim());

app.use(cors({
  origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS,
}));
app.use(express.json({ limit: '10mb' }));

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/questions',  questionRoutes);
app.use('/api/users',      usersRoutes);
app.use('/api/dashboard',  dashboardRoutes);
app.use('/api',            auditRoutes);          // /api/audit-log  + /api/login-history
app.use('/api/settings',   settingsRoutes);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const { error } = await supabase.from('questions').select('id').limit(1);
  if (error) {
    return res.status(503).json({ status: 'error', database: 'disconnected', details: error.message });
  }
  res.json({ status: 'ok', database: 'connected' });
});

// ── Static frontend ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log('Connected to Supabase');
  console.log(`Question Bank API running on http://localhost:${PORT}`);
  // Seed default admin if this is a fresh database
  await seedAdmin();
});
