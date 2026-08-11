'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const frontend = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

test('review notifications open their exact linked question', () => {
  assert.match(frontend, /onclick="openNotificationQuestion\('\$\{n\.id\}','\$\{n\.question_id\}'\)"/);
  assert.match(frontend, /async function openNotificationQuestion\(notificationId,questionId\)/);
  assert.match(frontend, /notificationQuestionToOpen=String\(questionId\)/);
  assert.match(frontend, /loadNotificationQuestion\(questionId\)/);
  assert.match(frontend, /apiRequest\('\/'\+encodeURIComponent\(id\)\)/);
});

test('opening a notification marks it read and highlights the question', () => {
  assert.match(frontend, /\/api\/notifications\/.*\/read/);
  assert.match(frontend, /clearQuestionFiltersForNotification\(\)/);
  assert.match(frontend, /notification-question-highlight/);
  assert.match(frontend, /Question opened for review\./);
});

