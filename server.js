require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const { allowedOrigins } = require('./lib/config');

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
const notificationRoutes = require('./routes/notifications');
const imageUploadRoutes = require('./routes/image-uploads');

// ── Admin seeder ─────────────────────────────────────────────────────────────
const seedAdmin = require('./lib/seed-admin');

// ── App configuration ────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 4000;
const ALLOWED_ORIGINS = allowedOrigins();

app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
}));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; img-src 'self' data: blob: https://res.cloudinary.com; font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '10mb' }));

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/questions',  questionRoutes);
app.use('/api/users',      usersRoutes);
app.use('/api/dashboard',  dashboardRoutes);
app.use('/api',            auditRoutes);          // /api/audit-log  + /api/login-history
app.use('/api/notifications', notificationRoutes);
app.use('/api/uploads', imageUploadRoutes);
app.use('/api', (req, res) => res.status(404).json({ success: false, error: 'API endpoint not found' }));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const [{ error: questionsError }, { error: sessionsError }] = await Promise.all([
    supabase.from('questions').select('id').limit(1),
    supabase.from('login_history').select('id').limit(1),
  ]);
  if (questionsError || sessionsError) {
    return res.status(503).json({ status: 'error', database: 'unavailable' });
  }
  res.json({ status: 'ok', database: 'connected' });
});

// ── Static frontend ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Export app & conditional startup for Vercel serverless functions ─────────
module.exports = app;

if (require.main === module) {
  (async () => {
    const { error: sessionStoreError } = await supabase.from('login_history').select('id').limit(1);
    if (sessionStoreError) {
      console.error('[startup] Required session store is unavailable.');
      process.exitCode = 1;
      return;
    }
    app.listen(PORT, async () => {
    console.log('Connected to Supabase');
    console.log(`Question Bank API running on http://localhost:${PORT}`);
    // Seed default admin if this is a fresh database
    await seedAdmin();
    });
  })();
}
