'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const frontend = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'index.html'), 'utf8');
const questions = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'questions.js'), 'utf8');

test('MQP IDs are computed from the earliest-to-latest sequence', () => {
  assert.match(questions, /mqpId: `MQP\$\{Math\.max\(1, total - offset - index\)\}`/);

  const visibleNewestFirst = (total, offset, length) =>
    Array.from({ length }, (_, index) => `MQP${total - offset - index}`);

  assert.deepEqual(
    visibleNewestFirst(5, 0, 5),
    ['MQP5', 'MQP4', 'MQP3', 'MQP2', 'MQP1']
  );

  assert.deepEqual(
    visibleNewestFirst(40, 25, 3),
    ['MQP15', 'MQP14', 'MQP13']
  );
});

test('Saved Questions visibly renders the computed MQP ID in uppercase', () => {
  assert.match(frontend, /toUpperCase\(\)/);
  assert.match(frontend, /color:var\(--gold\)/);
});

test('single deletion renumbers locally and bulk deletion refreshes once', () => {
  const removeBlock = frontend.slice(
    frontend.indexOf('remove:async function(id)'),
    frontend.indexOf('let questionFacetRequestSequence')
  );

  assert.match(removeBlock, /renumberLoadedQuestions\(\)/);
  assert.match(removeBlock, /renderList\(\)/);
  assert.match(frontend, /const remainingOnPage=allQuestions\.filter/);
  assert.match(frontend, /loadQuestions\(targetPage,true,false\)/);
});