'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('admin portal does not expose the removed Settings page', () => {
  assert.doesNotMatch(html, /pageSettings/);
  assert.doesNotMatch(html, /text:\s*'Settings'/);
  assert.doesNotMatch(html, /\/api\/settings/);
  assert.doesNotMatch(html, /loadSettings\s*\(/);
});

test('server does not mount the removed Settings API', () => {
  assert.doesNotMatch(server, /routes\/settings/);
  assert.doesNotMatch(server, /\/api\/settings/);
});
