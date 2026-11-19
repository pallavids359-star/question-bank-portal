'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const bulk = fs.readFileSync(path.join(root, 'public', 'bulk-import.js'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const questions = fs.readFileSync(path.join(root, 'routes', 'questions.js'), 'utf8');

function loadNextNameFn() {
  const start = questions.indexOf('const GT_PAPER_NAME_RE');
  const fnStart = questions.indexOf('function nextGrandTestPaperName');
  const fnEnd = questions.indexOf('\n}\n', fnStart) + 3;
  const code = questions.slice(start, questions.indexOf(';', start) + 1) + '\n' +
    questions.slice(fnStart, fnEnd) + '\nmodule.exports = nextGrandTestPaperName;';
  const sandbox = { module: { exports: null } };
  vm.runInNewContext(code, sandbox);
  return sandbox.module.exports;
}

test('Grand Test paper names are GT1, GT2… and never reused', () => {
  const next = loadNextNameFn();
  assert.equal(next(new Set()), 'GT1');
  assert.equal(next(new Set(['GT1', 'GT2'])), 'GT3');
  // GT2 deleted: still moves forward, never back to GT2.
  assert.equal(next(new Set(['GT1', 'GT3'])), 'GT4');
  // Older custom-named papers count towards the number.
  assert.equal(next(new Set(['ReNEET', 'Mock A'])), 'GT3');
  assert.equal(next(new Set(['ReNEET', 'GT3'])), 'GT4');
});

test('Server exposes next Grand Test name to adders/admins only', () => {
  assert.match(questions, /router\.get\('\/grand-test\/next-paper', \.\.\.CREATE_ROLES/);
  assert.match(questions, /\.neq\('chapter', 'Previous Year Questions'\)/);
});

test('Grand Test coverage is full syllabus only; Previous Year keeps Subject-wise', () => {
  assert.match(frontend, /const grandTestMode = document\.getElementById\('bqImportMode'\)\?\.value === 'grand_test';/);
  assert.match(frontend, /return !grandTestMode \|\| value !== 'Subject-wise';/);
  // Original per-exam lists are unchanged for Previous Year.
  assert.match(frontend, /NEET: \['PCB', 'Subject-wise'\]/);
});

test('Grand Test import uses the automatic name and requires @concept; Previous Year keeps @paper', () => {
  assert.match(bulk, /const paperName = meta\.isGrandTest \? state\.autoGrandTestPaper : grandTestHeader\.paper;/);
  assert.match(bulk, /if \(meta\.isPreviousYear && !q\.source\) q\.errors\.push\(`Question #\$\{num\}: @paper is required once at the top\.`\)/);
  assert.match(bulk, /if \(meta\.isGrandTest && !q\.paperConcept\) q\.errors\.push/);
  assert.match(bulk, /if \(paperConcept\) paperMetadata\.concept = paperConcept;/);
  assert.match(bulk, /const paper = await fetchGrandTestPaperName\(true\);/);
  assert.match(bulk, /applyGrandTestPaperName\(importList, paper\);/);
});

test('Saved Questions: Paper dropdown, then Class / Chapter / Concept for paper sets', () => {
  assert.match(frontend, /<select id="fPaper"[^>]*style="display:none;">/);
  const order = ['id="fQuestionSet"', 'id="fPaper"', 'id="fClass"', 'id="fConcept"'].map(id => frontend.indexOf(id));
  assert.ok(order.every((pos, i) => pos > 0 && (i === 0 || pos > order[i - 1])));
  assert.match(frontend, /savedFilterPaper\.style\.display=paperSet\?'':'none'/);
  assert.match(frontend, /appendSelectedSavedPaper\(params\);/);
  assert.match(frontend, /questionFacets\.paperConcepts/);
  assert.match(questions, /if \(concept && !paperSet\) query = query\.eq\('topic', concept\);/);
  assert.match(questions, /if \(paperName\) query = query\.eq\('source', paperName\);/);
  assert.match(questions, /filters\.concept && String\(metadata\.concept/);
});

test('Editing a paper question keeps its concept', () => {
  assert.match(frontend, /concept:String\(metadata\.concept\|\|''\)/);
  assert.match(frontend, /\.\.\.\(editingGrandTest\.concept\?\{concept:editingGrandTest\.concept\}:\{\}\)/);
  assert.match(frontend, /\.\.\.\(editingPreviousYear\.concept\?\{concept:editingPreviousYear\.concept\}:\{\}\)/);
});
