'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const routeSource = fs.readFileSync(path.join(root, 'routes/questions.js'), 'utf8');
const bulkSource = fs.readFileSync(path.join(root, 'public/bulk-import.js'), 'utf8');

test('server duplicate checks are scoped by subject, class, and normalized question', () => {
  assert.match(routeSource, /function duplicateScopeKey\(subject, klass, question\)/);
  assert.match(routeSource, /\.select\('id, subject, klass, question'\)/);
  assert.match(routeSource, /duplicateScopeKey\(input\.subject, input\.klass, input\.question\)/);
});

test('bulk import uses the same strict subject and class duplicate scope', () => {
  assert.match(bulkSource, /function duplicateScopeKey\(subject, klass, question\)/);
  assert.match(bulkSource, /subject: question\.subject \|\| ''/);
  assert.match(bulkSource, /klass: question\.klass \|\| ''/);
});

test('strict duplicate detection preserves skip overwrite and keep-both choices', () => {
  assert.match(bulkSource, /\['skip', 'overwrite', 'keep_both'\]/);
  assert.match(bulkSource, /q\.dupAction === 'skip'/);
  assert.match(bulkSource, /q\.dupAction = act/);
});
