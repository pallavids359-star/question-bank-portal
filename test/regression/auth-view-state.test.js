'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('../../public/auth-view-state');

for (const subject of ['Biology','Mathematics','Physics','Chemistry']) test(`${subject} user receives only assigned subject`, () => {
  assert.equal(state.permittedSubject({role:'viewer',subject}), subject);
});
test('Biology to Mathematics switch does not reuse Biology', () => {
  assert.equal(state.permittedSubject({role:'viewer',subject:'Biology'}),'Biology');
  assert.equal(state.permittedSubject({role:'viewer',subject:'Mathematics'}),'Mathematics');
});
test('admin is unrestricted', () => assert.equal(state.permittedSubject({role:'admin',subject:'Physics'}),''));
for (const user of [null,{}, {role:'viewer',subject:'All'}]) test('missing or unrestricted assignment exposes no stale assigned value', () => assert.equal(state.permittedSubject(user),''));
for (const [count, expected] of [[0,''],[1,'1'],[9,'9'],[99,'99'],[100,'99+'],[1000,'99+'],[-1,''],['bad','']]) {
  test(`notification badge formats ${count} safely`, () => assert.equal(state.badgeText(count),expected));
}
for (const key of ['c','C','x','p']) test(`viewer shortcut ${key} is identified`, () => assert.equal(state.isCopyShortcut({ctrlKey:true,key}),true));
for (const key of ['a','v','Tab','Enter']) test(`unrelated shortcut ${key} remains available`, () => assert.equal(state.isCopyShortcut({ctrlKey:true,key}),false));
test('plain C remains available', () => assert.equal(state.isCopyShortcut({key:'c'}),false));
test('viewer watermark combines name and masked email without secrets', () => assert.equal(state.watermarkIdentity({name:'Viewer One',email:'secret@example.com'}),'Viewer One · se***@example.com'));
test('viewer watermark masks email local part', () => assert.equal(state.watermarkIdentity({email:'someone@example.com'}),'so***@example.com'));
