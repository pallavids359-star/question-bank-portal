'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const frontend = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'index.html'),
  'utf8'
);

test('Saved Questions count stays hidden for Viewer after every render', () => {
  assert.match(frontend, /function renderSavedQuestionCount\(\)/);
  assert.match(frontend, /String\(Auth\.getRole\(\)\|\|''\)\.toLowerCase\(\)==='viewer'/);
  assert.match(frontend, /countLine\.hidden=isViewer/);
  assert.match(frontend, /countLine\.textContent=isViewer\s*\? ''/);

  const renderList = frontend.slice(
    frontend.indexOf('function renderList()'),
    frontend.indexOf('function renderQuestionPagination()')
  );
  assert.match(renderList, /renderSavedQuestionCount\(\)/);
  assert.doesNotMatch(renderList, /countLine\.textContent=questionTotal/);
});

test('role refresh reapplies Viewer count visibility', () => {
  const restrictions = frontend.slice(
    frontend.indexOf('function applyRoleRestrictions()'),
    frontend.indexOf('function setDifficultyOnlyMode')
  );
  assert.match(restrictions, /renderSavedQuestionCount\(\)/);
});
