'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');

function actionBody(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Missing ${startMarker}`);
  assert.notEqual(end, -1, `Missing ${endMarker}`);
  return html.slice(start, end);
}

test('question update renders local state without reloading Saved Questions', () => {
  const body = actionBody('async function saveQuestion(){', 'function resetForm(){');
  assert.match(body, /if\(wasEditing\)[\s\S]*renderList\(\)/);
  assert.match(body, /else[\s\S]*loadQuestions\(1,true\)/);
});

for (const [name, start, end] of [
  ['review', 'review: async function(id){', 'difficulty: async function(id, selectedDifficulty){'],
  ['difficulty', 'difficulty: async function(id, selectedDifficulty){', 'accept: async function(id, currentlyAccepted){'],
  ['accept', 'accept: async function(id, currentlyAccepted){', 'edit:function(id){'],
  ['delete', 'remove:async function(id){', '\n};\n\nasync function loadQuestionFacets(){'],
]) {
  test(`${name} updates Saved Questions in place`, () => {
    const body = actionBody(start, end);
    assert.match(body, /renderList\(\)/);
    assert.doesNotMatch(body, /loadQuestions\s*\(/);
    assert.doesNotMatch(body, /location\.reload|window\.location\s*=/);
  });
}
