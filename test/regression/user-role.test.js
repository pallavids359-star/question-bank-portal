'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeRoleSubject, decodeRoleSubject, toLogicalUser } = require('../../lib/user-role');

const subjects = ['All','Physics','Chemistry','Biology','Mathematics'];
const roles = ['admin','adder','editor','viewer'];
for (const role of roles) for (const subject of subjects) {
  test(`role/subject storage round trip preserves ${role} in ${subject}`, () => {
    const stored = encodeRoleSubject(role, subject);
    assert.deepEqual(decodeRoleSubject(stored.role, stored.subject), { role, subject });
  });
  test(`logical user preserves identity for ${role} in ${subject}`, () => {
    const stored = encodeRoleSubject(role, subject);
    const logical = toLogicalUser({ id: 'fixed', name: 'Test User', ...stored });
    assert.equal(logical.id, 'fixed'); assert.equal(logical.name, 'Test User'); assert.equal(logical.role, role); assert.equal(logical.subject, subject);
  });
}
