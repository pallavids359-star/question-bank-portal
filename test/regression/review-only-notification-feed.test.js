const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../routes/notifications.js'), 'utf8');

test('notification list and unread badge select the notification type for the current role', () => {
  const listRoute = source.slice(source.indexOf("router.get('/',"), source.indexOf("router.get('/unread-count'"));
  const countRoute = source.slice(source.indexOf("router.get('/unread-count'"), source.indexOf("router.get('/question-states'"));

  assert.match(listRoute, /visibleNotificationTypes\(role\)/);
  assert.match(listRoute, /\.in\('type', visibleTypes\)/);
  assert.match(countRoute, /visibleNotificationTypes\(role\)/);
  assert.match(countRoute, /\.in\('type', visibleTypes\)/);
});

test('acceptance workflow and question-state lookup remain available', () => {
  assert.match(source, /router\.post\('\/accept'/);
  assert.match(source, /router\.get\('\/question-states'/);
  assert.match(source, /'question_accepted'/);
  assert.match(source, /'question_acceptance_reversed'/);
});
