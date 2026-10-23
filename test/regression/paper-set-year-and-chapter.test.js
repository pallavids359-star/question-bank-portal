'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const bulk = fs.readFileSync(path.join(root, 'public', 'bulk-import.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

test('Grand Test papers do not carry a year; Previous Year papers require one', () => {
  assert.match(bulk, /const paperYear = meta\.isPreviousYear \? grandTestHeader\.year : ''/);
  assert.match(bulk, /if \(meta\.isPreviousYear && !q\.year\) q\.errors\.push/);
  assert.doesNotMatch(bulk, /if \(meta\.isPaperSet && !q\.year\)/);
});

test('Every Grand Test / Previous Year question requires its own @chapter', () => {
  assert.match(bulk, /const paperInline = extractInlineMetadata\(block\.lines\)/);
  assert.match(bulk, /const paperChapter = paperInline\.chapter \|\| ''/);
  assert.match(bulk, /chapter: paperChapter,/);
  assert.match(bulk, /if \(meta\.isPaperSet && !q\.paperChapter\) q\.errors\.push\(`Question #\$\{num\}: @chapter is required for every question\.`\)/);
});

test('Saved chapter column still identifies the paper set', () => {
  assert.match(bulk, /if \(meta\.isGrandTest\) return 'Full Syllabus'/);
  assert.match(bulk, /if \(meta\.isPreviousYear\) return 'Previous Year Questions'/);
});

test('Editing a paper question preserves its per-question chapter', () => {
  assert.match(frontend, /chapter:String\(metadata\.chapter\|\|''\)/);
  assert.match(frontend, /chapter:editingGrandTest\.chapter/);
  assert.match(frontend, /chapter:editingPreviousYear\.chapter/);
});

test('Every Grand Test / Previous Year question requires its own @class (11 or 12)', () => {
  assert.match(bulk, /klass: paperClass,/);
  assert.match(bulk, /@class must be 11 or 12 for every question\./);
  assert.match(frontend, /klass:String\(metadata\.klass\|\|''\)/);
  assert.match(frontend, /klass:editingGrandTest\.klass/);
  assert.match(frontend, /klass:editingPreviousYear\.klass/);
});
