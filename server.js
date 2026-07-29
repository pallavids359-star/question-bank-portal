require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

let supabase;
try {
  supabase = require('./lib/supabase');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const questionRoutes = require('./routes/questions');

const app = express();
const PORT = process.env.PORT || 4000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(value => value.trim());

app.use(
  cors({
    origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS,
  })
);
app.use(express.json({ limit: '10mb' }));

app.use('/api/questions', questionRoutes);

app.get('/health', async (req, res) => {
  const { error } = await supabase.from('questions').select('id').limit(1);

  if (error) {
    return res.status(503).json({
      status: 'error',
      database: 'disconnected',
      details: error.message,
    });
  }

  res.json({ status: 'ok', database: 'connected' });
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log('Connected to Supabase');
  console.log(`Question Bank API running on http://localhost:${PORT}`);
});
