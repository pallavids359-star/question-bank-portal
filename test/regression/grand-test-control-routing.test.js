'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const questions = fs.readFileSync(path.join(root, 'routes/questions.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'routes/dashboard.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'routes/auth.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('Grand Test Full Syllabus routes directly to Control DB', () => {
  assert.match(questions, /function isGrandTestKlass\(klass\)/);
  assert.match(
    questions,
    /function questionClientFor\(subject, klass\)\s*\{\s*if \(isGrandTestKlass\(klass\)\) return supabaseControl;/
  );
});

test('Grand Test participates in duplicate checking and facets', () => {
  assert.match(questions, /grandTestCountResult/);
  assert.match(
    questions,
    /supabaseControl\.from\('questions'\)\.select\('id', \{ count: 'exact', head: true \}\)/
  );

  const sourceMatches =
    questions.match(/\{ client: supabaseControl, skipMigratedShards: false \},/g) || [];

  assert.ok(
    sourceMatches.length >= 2,
    'Control DB should be present in duplicate and facet source arrays'
  );
});

test('Grand Test can be found by id for open edit and delete', () => {
  assert.match(
    questions,
    /for \(const shardClient of \[\s*supabaseControl,\s*supabasePhysics11,/
  );
});

test('dashboard and contribution reports use Control DB for Full Syllabus', () => {
  assert.match(dashboard, /const supabase = supabaseControl;/);
  assert.match(auth, /const supabase = supabaseControl;/);
});

test('health verifies Control DB questions table used by Grand Test', () => {
  assert.match(server, /name:\s*'grand-test-control'/);
  assert.match(server, /table:\s*'questions'/);
});
