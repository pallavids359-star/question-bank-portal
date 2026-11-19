'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const questions = fs.readFileSync(path.join(root, 'routes', 'questions.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations', '08_taxonomy_overrides.sql'), 'utf8');

function loadOverrideLogic() {
  const start = html.indexOf('var TAXONOMY_BASE_CHAPTERS = null;');
  const end = html.indexOf('function updateTopicSuggestions()');
  const sandbox = {
    NCERT_CHAPTERS: { 'Physics-12': ['Current Electricity', 'Magnetism and Matter'], 'Mathematics-11': ['Sets'], 'Maths-11': ['Sets'] },
    BULK_NCERT_CHAPTERS: { 'Physics-12': ['Current Electricity', 'Magnetism and Matter'], 'Mathematics-11': ['Sets'] },
    canonicalSubject: s => s,
    updateChapterOptions() {}, updateBulkChapterOptions() {}, updateTopicSuggestions() {},
  };
  vm.runInNewContext(html.slice(start, end) + '\nthis.apply = applyTaxonomyOverrides;', sandbox);
  return sandbox;
}

test('No saved changes leaves every chapter list exactly as built in', () => {
  const s = loadOverrideLogic();
  const before = JSON.stringify([s.NCERT_CHAPTERS, s.BULK_NCERT_CHAPTERS]);
  s.apply([]);
  assert.equal(JSON.stringify([s.NCERT_CHAPTERS, s.BULK_NCERT_CHAPTERS]), before);
});

test('Saved changes add, hide and can be undone without losing the built-in list', () => {
  const s = loadOverrideLogic();
  const listRef = s.NCERT_CHAPTERS['Physics-12'];
  s.apply([
    { kind: 'chapter', subject: 'Physics', klass: '12', name: 'Electric Current', state: 'added' },
    { kind: 'chapter', subject: 'Physics', klass: '12', name: 'Current Electricity', state: 'removed' },
    { kind: 'chapter', subject: 'Mathematics', klass: '11', name: 'Logic', state: 'added' },
    { kind: 'concept', subject: 'Physics', klass: '12', chapter: 'Electric Current', name: 'Drift Velocity', state: 'added' },
  ]);
  assert.equal(s.NCERT_CHAPTERS['Physics-12'], listRef, 'same array object is updated in place');
  assert.deepEqual([...s.NCERT_CHAPTERS['Physics-12']], ['Magnetism and Matter', 'Electric Current']);
  assert.deepEqual([...s.BULK_NCERT_CHAPTERS['Physics-12']], ['Magnetism and Matter', 'Electric Current']);
  assert.deepEqual([...s.NCERT_CHAPTERS['Maths-11']], ['Sets', 'Logic']);
  s.apply([]);
  assert.deepEqual([...s.NCERT_CHAPTERS['Physics-12']], ['Current Electricity', 'Magnetism and Matter']);
});

test('Manager endpoints: admins and adders, subject-limited, delete blocked while in use', () => {
  ['add', 'move', 'delete'].forEach(action => {
    assert.match(questions, new RegExp(`router\\.post\\('/taxonomy/${action}', \\.\\.\\.CREATE_ROLES`));
  });
  assert.match(questions, /router\.get\('\/taxonomy', \.\.\.READ_ROLES/);
  assert.match(questions, /You can manage chapters and concepts only in your assigned subject\./);
  assert.match(questions, /if \(usage\.total > 0\) \{\n\s+return res\.status\(409\)/);
});

test('Rename/merge rewrites only the paper metadata marker, never question text', () => {
  assert.match(questions, /String\(row\.solution_text \|\| ''\)\.replace\(DATA_MARKER_RE, \(\) => marker\)/);
  assert.doesNotMatch(questions.slice(questions.indexOf('async function moveTaxonomyQuestions')), /question:\s*toName/);
});

test('Migration is additive and server-only', () => {
  assert.match(migration, /create table if not exists public\.taxonomy_overrides/);
  assert.doesNotMatch(migration, /drop table|delete from|truncate|alter table public\.questions/i);
  assert.match(migration, /revoke all on table public\.taxonomy_overrides from anon, authenticated/);
});

test('Sidebar shows Chapters & Concepts to admins and adders only', () => {
  assert.match(html, /page:'pageTaxonomy', roles:\['admin','adder'\]/);
  assert.match(html, /id="pageTaxonomy" class="page-section"/);
});
