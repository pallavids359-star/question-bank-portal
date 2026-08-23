'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const bulkJs = fs.readFileSync(path.join(root, 'public/bulk-import.js'), 'utf8');
const questionRoutes = fs.readFileSync(path.join(root, 'routes/questions.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/05_grand_test_metadata.sql'), 'utf8');

test('Grand Test Paper mode exposes only the requested metadata controls', () => {
  assert.match(html, /id="bqImportMode"/);
  assert.match(html, /value="grand_test">Grand Test Paper/);
  assert.match(html, /id="bqMetaCoverage"/);
  assert.match(html, /NEET: \['PCB', 'Subject-wise'\]/);
  assert.match(html, /JEE: \['PCM', 'Subject-wise'\]/);
  assert.match(html, /KCET: \['PCMB', 'PCM', 'PCB', 'Subject-wise'\]/);
  assert.match(html, /NEET: \['Physics', 'Chemistry', 'Biology'\]/);
  assert.match(html, /JEE: \['Physics', 'Chemistry', 'Mathematics'\]/);
});

test('Grand Test parser requires and stores paper, year, coverage, and subject metadata', () => {
  assert.match(bulkJs, /@paper\\s\*\[:=\]/);
  assert.match(bulkJs, /@year\\s\*\[:=\]/);
  assert.match(bulkJs, /if \(meta\.isGrandTest\) return 'Full Syllabus';/);
  assert.match(bulkJs, /grandSubjectFromLatex: Boolean\(inline\.subject\)/);
  assert.match(bulkJs, /source: q\.source \|\| ''/);
  assert.match(bulkJs, /year: q\.year \|\| ''/);
  assert.match(questionRoutes, /'reference_book', 'year'/);
  assert.match(questionRoutes, /specialData\?\.grandTest/);
  assert.match(questionRoutes, /const GRAND_TEST_LEGACY_FIELDS/);
});

test('Grand Test metadata migration is additive and non-destructive', () => {
  assert.match(migration, /add column if not exists source/i);
  assert.match(migration, /add column if not exists year/i);
  assert.doesNotMatch(migration, /\b(?:delete|truncate|drop|update)\b/i);
});

test('Saved Questions search is applied only to question text', () => {
  assert.match(questionRoutes, /String\(params\.search \|\| ''\)/);
  assert.match(questionRoutes, /query\.ilike\('question', `%\$\{search\}%`\)/);
  assert.doesNotMatch(questionRoutes, /query\.or\([^\n]*search/);
});
