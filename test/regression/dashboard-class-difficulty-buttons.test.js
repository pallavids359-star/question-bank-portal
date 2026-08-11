'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const frontend = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'routes', 'dashboard.js'), 'utf8');

test('Admin question distribution groups Subject, Class, Chapter and Concept', () => {
  assert.match(frontend, /Subject → Class → Chapter → Concept question count/);
  assert.match(dashboard, /classes:\s*\{\}/);
  assert.match(dashboard, /\.classes\[klass\][\s\S]*\.chapters\[chapter\][\s\S]*\.concepts\[concept\]/);
  assert.match(frontend, /subjectData\.classes/);
  assert.match(frontend, /classData\.chapters/);
});

test('Editor difficulty is assigned with Easy, Medium and Hard buttons', () => {
  assert.match(frontend, /\['Easy','Medium','Hard'\]\.forEach/);
  assert.match(frontend, /QP\.difficulty\(q\.id,level\)/);
  assert.match(frontend, /difficulty-button-group/);
  assert.match(frontend, /difficulty-level-btn\.selected/);
});

test('button assignment updates the visible question locally after success', () => {
  assert.match(frontend, /q\.difficulty=difficulty\.charAt/);
  assert.match(frontend, /showToast\('Difficulty updated\.'\);\s*renderSavedQuestionsWithoutReload\(\);/);
});
