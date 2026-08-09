'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const frontend = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'routes', 'questions.js'), 'utf8');

test('Editor question cards expose only Review, Difficulty, and Accept workflow controls', () => {
  assert.doesNotMatch(frontend, /QP\.history|Question History|textContent\s*=\s*['"]History['"]/);
});

test('question History API is not registered', () => {
  assert.doesNotMatch(routes, /router\.get\(['"]\/:id\/history['"]/);
});
