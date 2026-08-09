'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const view = require('../../public/dashboard-view');

test('recently added success preserves backend ordering and records', () => {
  const rows = [{ id:'newest' }, { id:'older' }];
  assert.deepEqual(view.recentState(rows), { kind:'success', items:rows });
});
test('recently edited success preserves backend ordering and records', () => {
  const rows = [{ id:'edited' }];
  assert.deepEqual(view.recentState(rows), { kind:'success', items:rows });
});
for (const value of [[], null, undefined]) test('empty dashboard result reaches an empty terminal state', () => {
  assert.deepEqual(view.recentState(value), { kind:'empty', items:[] });
});
test('authorization failure reaches a controlled error terminal state', () => {
  assert.deepEqual(view.failureState(401), { kind:'error', message:'Authorization failed.' });
});
for (const status of [400, 403, 500, 503]) test(`server failure ${status} reaches a controlled error terminal state`, () => {
  assert.deepEqual(view.failureState(status), { kind:'error', message:'Could not load live data.' });
});
