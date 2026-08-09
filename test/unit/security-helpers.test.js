'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLE_PERMISSIONS, hasPermission, safeInteger, isUuid } = require('../../lib/security');

const permissions = ['QUESTION_READ','QUESTION_CREATE','QUESTION_UPDATE','QUESTION_DELETE','USER_MANAGE','AUDIT_READ','SETTINGS_UPDATE'];
const roles = ['admin','adder','editor','viewer','unknown'];
for (const role of roles) {
  for (const permission of permissions) {
    test(`permission matrix: ${role} / ${permission}`, () => {
      assert.equal(hasPermission(role, permission), (ROLE_PERMISSIONS[role] || []).includes(permission));
    });
  }
}

for (let value = -100; value <= 200; value += 1) {
  test(`bounded integer clamps deterministic input ${value}`, () => {
    assert.equal(safeInteger(value, 25, { min: 0, max: 100 }), Math.min(100, Math.max(0, value)));
  });
}

const validUuidBases = Array.from({ length: 100 }, (_, i) => `${i.toString(16).padStart(8,'0')}-1234-4abc-8def-${i.toString(16).padStart(12,'0')}`);
for (const value of validUuidBases) test(`UUID accepts RFC4122-shaped value ${value}`, () => assert.equal(isUuid(value), true));
const invalidUuidValues = Array.from({ length: 100 }, (_, i) => `${i}-not-a-uuid-${'x'.repeat(i % 20)}`);
for (const value of invalidUuidValues) test(`UUID rejects malformed value ${value}`, () => assert.equal(isUuid(value), false));
