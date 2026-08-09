'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hasPermission } = require('../../lib/security');

const root = path.join(__dirname, '..', '..');

test('Adder can delete questions while Editor and Viewer cannot', () => {
  assert.equal(hasPermission('admin', 'QUESTION_DELETE'), true);
  assert.equal(hasPermission('adder', 'QUESTION_DELETE'), true);
  assert.equal(hasPermission('editor', 'QUESTION_DELETE'), false);
  assert.equal(hasPermission('viewer', 'QUESTION_DELETE'), false);
});

test('question delete route authorizes Admin and Adder', () => {
  const routes = fs.readFileSync(path.join(root, 'routes', 'questions.js'), 'utf8');
  assert.match(
    routes,
    /const DELETE_ROLES\s*=\s*\[requireAuth, requireRole\('admin', 'adder'\)\]/
  );
});

test('browser permission map and delete guard allow Adder', () => {
  const page = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert.match(page, /adder:\s*\['view','add','edit','delete','bulk_import'\]/);
  assert.match(page, /Only an Admin or Adder can delete questions\./);
});
