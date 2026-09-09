'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const frontend = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const bulk = fs.readFileSync(path.join(root, 'public', 'bulk-import.js'), 'utf8');
const questions = fs.readFileSync(path.join(root, 'routes', 'questions.js'), 'utf8');

test('Previous Year Question is available in import and Saved Questions', () => {
  assert.match(frontend, /value="previous_year">Previous Year Question Paper/);
  assert.match(frontend, /value="previous_year">Previous Year Questions/);
  assert.match(frontend, /questionSetF==='previous_year'&&previousYear/);
  assert.match(frontend, /Previous Year Question · /);
});

test('Previous Year import reuses paper metadata and identifies its own question set', () => {
  assert.match(bulk, /isPreviousYear:\s*importMode === 'previous_year'|const isPreviousYear = importMode === 'previous_year'/);
  assert.match(bulk, /if \(meta\.isPreviousYear\) question\.previousYear = paperMetadata/);
  assert.match(bulk, /previousYear: q\.previousYear \|\| null/);
  assert.match(bulk, /if \(meta\.isPreviousYear\) return 'Previous Year Questions'/);
});

test('Previous Year records use the GT control database without a schema change', () => {
  assert.match(questions, /specialData\?\.grandTest \|\| specialData\?\.previousYear/);
  assert.match(questions, /previousYear: input\.previousYear \|\| null/);
  assert.match(questions, /output\.previousYear = previousYearData/);
  assert.match(questions, /questionSet === 'previous_year'/);
  assert.match(questions, /\.eq\('chapter', 'Previous Year Questions'\)/);
  assert.match(questions, /\['grand_test', 'previous_year'\]\.includes/);
});

test('Previous Year edit preserves metadata and uses the normal question editor', () => {
  assert.match(frontend, /function previousYearMetadataFor\(question\)/);
  assert.match(frontend, /editingPreviousYear\?'Edit Previous Year Question'/);
  assert.match(frontend, /chapter:editingPreviousYear\?'Previous Year Questions'/);
  assert.match(frontend, /previousYear:editingPreviousYear\?\{/);
  assert.match(frontend, /setGrandTestEditMode\(q\)/);
  assert.match(frontend, /data-target="question"/);
  assert.match(frontend, /id="correctOption"/);
});
