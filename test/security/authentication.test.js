'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { getJwtSecret } = require('../../lib/config');

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(body) { this.payload = body; return this; } };
}
function invoke(token) {
  const req = { headers: token === null ? {} : { authorization: token } };
  const res = response(); let next = false;
  requireAuth(req, res, () => { next = true; });
  return { req, res, next };
}

const malformed = Array.from({ length: 100 }, (_, i) => `Bearer ${Buffer.from(`attack-${i}`).toString('base64url')}.${Buffer.from('{"role":"admin"}').toString('base64url')}.forged`);
for (const token of malformed) test('rejects forged bearer token variant', () => { const result = invoke(token); assert.equal(result.next, false); assert.equal(result.res.statusCode, 401); });

for (let i = 0; i < 75; i += 1) {
  test(`accepts valid signed token variant ${i}`, () => {
    const token = jwt.sign({ userId: `user-${i}`, role: ['admin','adder','editor','viewer'][i % 4] }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '5m' });
    const result = invoke(`Bearer ${token}`); assert.equal(result.next, true); assert.equal(result.req.user.userId, `user-${i}`);
  });
}
for (let i = 0; i < 50; i += 1) {
  test(`rejects expired signed token variant ${i}`, () => {
    const token = jwt.sign({ userId: `expired-${i}` }, getJwtSecret(), { algorithm: 'HS256', expiresIn: -1 });
    assert.equal(invoke(`Bearer ${token}`).res.statusCode, 401);
  });
}
for (const role of ['admin','adder','editor','viewer','unknown']) {
  for (const allowed of [['admin'],['adder'],['editor'],['viewer'],['admin','adder'],['admin','adder','editor','viewer']]) {
    test(`role guard ${role} against ${allowed.join('+')}`, () => {
      const req = { user: { role } }; const res = response(); let next = false;
      requireRole(...allowed)(req, res, () => { next = true; });
      assert.equal(next, allowed.includes(role));
      if (!next) assert.equal(res.statusCode, 403);
    });
  }
}
