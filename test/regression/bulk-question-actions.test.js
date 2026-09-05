'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const frontend = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'index.html'),
  'utf8'
);

test('Saved Questions supports persistent multi-selection and all requested bulk actions', () => {
  assert.match(frontend, /id="selectVisibleQuestions"/);
  assert.match(frontend, /var selectedQuestionIds = new Map\(\)/);
  assert.match(frontend, /className='question-select'/);
  assert.match(frontend, /bulkReviewQuestions/);
  assert.match(frontend, /bulkAcceptQuestions/);
  assert.match(frontend, /bulkDeleteQuestions/);
  assert.match(frontend, /runQuestionBatch\(action,questions,concurrency=6\)/);
});

test('bulk actions retain the existing role boundaries', () => {
  assert.match(frontend, /role==='admin'\|\|role==='editor'/);
  assert.match(frontend, /if\(!Auth\.can\('delete'\)\)return showToast\('Only an Admin or Adder can delete questions\.'/);
  assert.match(frontend, /toolbar\.hidden=!visible/);
});

test('question cards render before review-state and facet requests finish', () => {
  const loader = frontend.slice(
    frontend.indexOf('async function loadQuestions('),
    frontend.indexOf('// ============================================================\n// ── INITIALISATION')
  );
  const renderPosition = loader.indexOf('renderList();');
  const stateAwaitPosition = loader.indexOf("await apiReq('/api/notifications/question-states");
  assert.ok(renderPosition > -1 && stateAwaitPosition > -1 && renderPosition < stateAwaitPosition);
  assert.doesNotMatch(loader, /await loadQuestionFacets\(\)/);
});
