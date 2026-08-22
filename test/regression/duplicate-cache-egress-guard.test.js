'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../../routes/questions.js'),
  'utf8'
);

test('duplicate cache shares one in-flight full-table load per server instance', () => {
  assert.match(source, /let duplicateQuestionCacheLoad = null;/);
  assert.match(
    source,
    /if \(duplicateQuestionCacheLoad\) return duplicateQuestionCacheLoad;/
  );
  assert.match(source, /duplicateQuestionCacheLoad = \(async \(\) => \{/);
  assert.match(source, /duplicateQuestionCacheLoad = null;/);
});

test('successful inserts keep the duplicate-cache row count synchronized', () => {
  assert.match(
    source,
    /duplicateQuestionCache\.total \+= insertedRows\.length;/
  );
  assert.match(source, /rememberDuplicateQuestions\(\[data\]\);/);
  assert.match(source, /rememberDuplicateQuestions\(insertedData\);/);
});

test('duplicate normalization and database selection remain unchanged', () => {
  assert.match(source, /function normalizeDuplicateQuestion\(value\)/);
  assert.match(source, /\.select\('id, question'\)/);
  assert.match(source, /normalizeDuplicateQuestion\(row\.question\)/);
});
