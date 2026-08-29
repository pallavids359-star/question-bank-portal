'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

const read = rel =>
  fs.readFileSync(path.join(root, rel), 'utf8');

test('Physics 12 routes to its shard and Cloudinary', () => {
  const questions = read('routes/questions.js');
  const dashboard = read('routes/dashboard.js');
  const frontend = read('public/index.html');
  const uploads = read('routes/image-uploads.js');
  const client = read('lib/supabase-physics-12.js');

  assert.match(client, /SUPABASE_PHYSICS_12_URL/);
  assert.match(client, /SUPABASE_PHYSICS_12_SECRET_KEY/);

  assert.match(questions, /supabasePhysics12/);
  assert.match(questions, /function isPhysics12/);
  assert.match(questions, /isMigratedQuestionShard/);

  assert.match(dashboard, /supabasePhysics12/);
  assert.match(dashboard, /sourcePhysics12/);
  assert.match(dashboard, /shardPhysics12/);

  assert.match(uploads, /\['11', '12'\]\.includes/);
  assert.match(frontend, /\['11', '12'\]\.includes/);
  assert.match(frontend, /klass:\s*normalizedClass/);
});
