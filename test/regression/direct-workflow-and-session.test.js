'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const frontend = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const notifications = fs.readFileSync(path.join(root, 'routes', 'notifications.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'routes', 'auth.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'routes', 'dashboard.js'), 'utf8');

test('frontend uses the established direct workflow routes', () => {
  for (const action of ['review', 'difficulty', 'accept']) {
    assert.match(frontend, new RegExp(`/api/notifications/${action}`));
    assert.match(notifications, new RegExp(`router\\.post\\('/${action}'`));
  }
  assert.match(server, /app\.use\('\/api\/notifications', notificationRoutes\)/);
});

test('user-facing question History route remains absent', () => {
  assert.doesNotMatch(notifications, /question\/:questionId\/history/);
  assert.doesNotMatch(frontend, /openReviewHistory|View complete review history/);
});

test('direct workflow uses existing questions and notifications tables only', () => {
  assert.doesNotMatch(notifications, /question_review_state|question_review_history|apply_question_workflow/);
  assert.match(notifications, /from\('notifications'\)/);
  assert.match(frontend, /api\/notifications\/question-states/);
});

test('Accept button can reverse acceptance without deleting history', () => {
  assert.match(frontend, /accepted:nextAccepted/);
  assert.match(frontend, /Reverse acceptance for this question/);
  assert.match(frontend, /Question acceptance reversed/);
  assert.doesNotMatch(frontend, /acceptBtn\.disabled = isAccepted/);
  assert.match(notifications, /question_acceptance_reversed/);
  assert.doesNotMatch(notifications, /from\('notifications'\)\.delete/);
});

test('logout closes the exact session and reports storage failure', () => {
  assert.match(auth, /closeLoginSession\(req\.user\.userId, req\.user\.loginHistoryId\)/);
  assert.match(auth, /\.is\('logout_time', null\)/);
  assert.match(auth, /Unable to close this login session/);
});

test('assigned subject is applied before database profile refresh', () => {
  const init = frontend.slice(frontend.indexOf('async function initializeAuthenticatedApp'), frontend.indexOf('function sameSubject'));
  assert.ok(init.indexOf('showAppPage();') < init.indexOf("apiReq('/api/auth/me')"));
  assert.match(frontend, /filterSubject\.disabled = true/);
});

test('recent dashboard lists have a fast independent endpoint', () => {
  assert.match(dashboard, /router\.get\('\/recent'/);
  assert.match(frontend, /apiReq\('\/api\/dashboard\/recent'\)/);
});
