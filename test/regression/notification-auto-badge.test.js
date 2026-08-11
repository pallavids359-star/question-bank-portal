'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'index.html'),
  'utf8'
);
const route = fs.readFileSync(
  path.join(__dirname, '..', '..', 'routes', 'notifications.js'),
  'utf8'
);

test('notification badge updates automatically without a page reload', () => {
  assert.match(html, /NOTIFICATION_BADGE_INTERVAL_MS\s*=\s*2\s*\*\s*1000/);
  assert.match(html, /setInterval\(\s*refreshNotificationsIfVisible/);
  assert.match(html, /\/api\/notifications\/unread-count\?ts=/);
  assert.match(html, /setNotificationBadge\(result && result\.unread\)/);
  assert.doesNotMatch(html, /location\.reload\s*\(/);
});

test('badge polling handles role casing and authentication lifecycle', () => {
  assert.match(html, /String\(Auth\.getRole\(\) \|\| ''\)\.toLowerCase\(\)/);
  assert.match(html, /function showLoginPage\(\)\s*\{\s*stopNotificationPolling\(\)/);
  assert.match(html, /loadNotifications\(\);\s*startNotificationPolling\(\)/);
  assert.match(html, /visibilitychange[\s\S]*?refreshNotificationsIfVisible\(\)/);
});

test('unread-count endpoint is lightweight and not cached', () => {
  assert.match(route, /router\.get\('\/unread-count'/);
  assert.match(route, /select\('id', \{ count: 'exact', head: true \}\)/);
  assert.match(route, /eq\('recipient_id', req\.user\.userId\)/);
  assert.match(route, /eq\('is_read', false\)/);
  assert.match(route, /Cache-Control', 'no-store'/);
});
