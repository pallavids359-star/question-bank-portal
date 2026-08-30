'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const questionsPath = path.join(__dirname, '..', '..', 'routes', 'questions.js');
const source = fs.readFileSync(questionsPath, 'utf8');

test('Saved Questions broad reads aggregate Control and question shards', () => {
  assert.match(source, /function questionReadSourcesFor\(subject, klass\)/);
  assert.match(source, /return \[\s*supabaseControl,\s*supabasePhysics11,\s*supabasePhysics12,\s*supabaseChemistry11,\s*supabaseChemistry12,\s*supabaseBiology11,\s*supabaseBiology12,\s*supabaseMathematics11,\s*supabaseMathematics12,/);
});

test('Saved Questions no longer falls back to the disconnected legacy DB', () => {
  const start = source.indexOf("router.get('/', ...READ_ROLES");
  const end = source.indexOf("router.post('/duplicates'", start);
  assert.ok(start >= 0 && end > start);

  const block = source.slice(start, end);
  assert.match(block, /questionReadSourcesFor\(listSubject, req\.query\.klass\)/);
  assert.match(block, /Promise\.all\(readSources\.map\(async questionClient =>/);
  assert.doesNotMatch(block, /questionClientFor\(listSubject,\s*req\.query\.klass\)/);
  assert.doesNotMatch(block, /\bsupabase\.from\(/);
});

test('Saved Questions applies global pagination after merging shard results', () => {
  const start = source.indexOf("router.get('/', ...READ_ROLES");
  const end = source.indexOf("router.post('/duplicates'", start);
  const block = source.slice(start, end);

  assert.match(block, /flatMap\(result => result\.rows\)/);
  assert.match(block, /\.slice\(offset,\s*offset \+ limit\)/);
  assert.match(block, /sourceResults\.reduce\(/);
});