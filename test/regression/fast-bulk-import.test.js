'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const bulkJs = fs.readFileSync(path.join(root, 'public/bulk-import.js'), 'utf8');
const questionRoutes = fs.readFileSync(path.join(root, 'routes/questions.js'), 'utf8');

function functionBody(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Missing ${startMarker}`);
  assert.notEqual(end, -1, `Missing ${endMarker}`);
  return source.slice(start, end);
}

test('bulk import avoids reloading Saved Questions after a successful insert', () => {
  const body = functionBody(
    bulkJs,
    'async function executeBulkImport()',
    'async function fetchExistingQuestions()'
  );

  assert.match(body, /apiReq\('\/api\/questions\/batch'/);
  assert.doesNotMatch(body, /loadQuestions\s*\(/);
  assert.doesNotMatch(body, /location\.reload|window\.location\s*=/);
});

test('bulk route uses a large chunk to minimize database round-trips', () => {
  const body = functionBody(
    questionRoutes,
    "router.post('/batch'",
    "router.put('/:id'"
  );

  assert.match(body, /const chunkSize = 500;/);
});
