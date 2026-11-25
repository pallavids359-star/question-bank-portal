'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const bulk = fs.readFileSync(path.join(root, 'public/bulk-import.js'), 'utf8');
const questions = fs.readFileSync(path.join(root, 'routes/questions.js'), 'utf8');

test('Previous Year and Grand Test imports have their own sidebar entries', () => {
  assert.match(html, /text:'Bulk Import \(Chapter-wise\)', page:'pageBulkImport'/);
  assert.match(html, /text:'Previous Year Paper Import', page:'pageBulkImportPYQ'/);
  assert.match(html, /text:'Grand Test Paper Import', page:'pageBulkImportGT'/);
  assert.match(html, /pageBulkImportPYQ: \{\n    mode: 'previous_year'/);
  assert.match(html, /pageBulkImportGT: \{\n    mode: 'grand_test'/);
  // the type is fixed by the sidebar entry, so the selector is hidden
  assert.match(html, /id="bqImportModeGroup" style="margin:0;display:none;"/);
});

test('Each import type keeps its own editor draft (chapter-wise keeps the old key)', () => {
  assert.match(bulk, /return !mode \|\| mode === 'chapter' \? 'bq_draft_v2' : 'bq_draft_v2_' \+ mode;/);
  assert.doesNotMatch(bulk, /'bq_draft_v2'\)/);
  assert.match(bulk, /setImportMode,/);
});

test('Paper imports skip the per-question duplicate check', () => {
  assert.match(bulk, /if \(getMeta\(\)\.isPaperSet\) \{\n    questions\.forEach\(question => \{\n      question\.isDuplicate = false;/);
  assert.match(bulk, /if \(getMeta\(\)\.isPaperSet\) \{\n    return checkPaperDuplicate\(questions, requestId\);/);
});

test('Paper imports are checked for duplicates as a whole paper', () => {
  assert.match(questions, /router\.post\('\/paper-duplicates', \.\.\.CREATE_ROLES/);
  assert.match(questions, /const importedKeys = new Set\(questions\.map\(normalizeDuplicateQuestion\)\.filter\(Boolean\)\)/);
  assert.match(bulk, /full: papers\.find\(p => total > 0 && p\.matched >= total\)/);
  assert.match(bulk, /Import it again as a separate copy\?/);
  assert.match(html, /id="bqPaperDuplicate"/);
});

test('Chapter-wise (default) lists and dropdowns never include paper questions', () => {
  assert.match(questions, /query = query\n      \.neq\('klass', 'Full Syllabus'\)\n      \.neq\('klass', 'Class Full Syllabus'\);\n  \}/);
  assert.match(questions, /if \(!isPaperQuestionSet\(questionSet\) && isPaperRow\(row\)\) return false;/);
  assert.match(html, /\|\|\(!\['grand_test','previous_year'\]\.includes\(questionSetF\)&&!grandTest&&!previousYear\);/);
});
