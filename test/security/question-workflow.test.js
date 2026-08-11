'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const notifications = fs.readFileSync(path.join(root, 'routes', 'notifications.js'), 'utf8');

test('workflow routes require an active Editor or Admin session', () => {
  assert.match(notifications, /const EDITOR_ONLY = \[requireAuth, requireActiveSession, requireRole\('editor', 'admin'\)\]/);
  for (const action of ['difficulty', 'review', 'accept']) {
    assert.match(notifications, new RegExp(`router\\.post\\('/${action}', \\.\\.\\.EDITOR_ONLY`));
  }
});

test('workflow validates subject access using the authenticated database user', () => {
  assert.match(notifications, /const user = await effectiveUser\(req\.user\)/);
  assert.match(notifications, /hasSubjectAccess\(user, question\.subject\)/);
});

test('workflow does not use RPC, History, or additional review tables', () => {
  assert.doesNotMatch(notifications, /\.rpc\(|apply_question_workflow|question_review_state|question_review_history/);
  assert.doesNotMatch(notifications, /question\/:questionId\/history/);
});

test('Difficulty, Review, and Accept validate their direct request bodies', () => {
  assert.match(notifications, /Select Easy, Medium, or Hard/);
  assert.match(notifications, /Enter a review message/);
  assert.match(notifications, /Review message must be 1000 characters or fewer/);
  assert.match(notifications, /questionId is required/);
});

test('Accept is a reversible, idempotent workflow event', () => {
  assert.match(notifications, /question_acceptance_reversed/);
  assert.match(notifications, /currentlyAccepted === shouldAccept/);
  assert.match(notifications, /REVERSE_QUESTION_ACCEPTANCE/);
});
