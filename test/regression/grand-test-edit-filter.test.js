'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const frontend = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'index.html'), 'utf8');
const questions = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'questions.js'), 'utf8');

test('Saved Questions has explicit chapter-wise and Grand Test views', () => {
  assert.match(frontend, /id="fQuestionSet"/);
  assert.match(frontend, /value="chapter">Chapter-wise Questions/);
  assert.match(frontend, /value="grand_test">Grand Test Questions/);
  assert.match(frontend, /params\.set\('questionSet',questionSet\)/);
  assert.match(questions, /questionSet === 'grand_test'/);
  assert.match(questions, /questionSet === 'chapter'/);
});

test('Grand Test API output retains paper year and coverage edit metadata', () => {
  assert.match(questions, /output\.grandTest = grandTestData/);
  assert.match(questions, /paper: row\.source \|\| ''/);
  assert.match(questions, /coverage: \['Subject-wise', 'PCM', 'PCB', 'PCMB'\]/);
});

test('Grand Test edit preserves routing metadata and locks unrelated classification fields', () => {
  assert.match(frontend, /function setGrandTestEditMode\(question\)/);
  assert.match(frontend, /klass\.value='Full Syllabus';klass\.disabled=true/);
  assert.match(frontend, /const paperChapter=editingPreviousYear\?'Previous Year Questions':'Full Syllabus'/);
  assert.match(frontend, /chapter\.value=paperChapter;chapter\.disabled=true/);
  assert.match(frontend, /if\(qType\)qType\.disabled=true/);
  assert.match(frontend, /subject\.disabled=editingPaper\.coverage!=='Subject-wise'/);
  assert.match(frontend, /grandTest:editingGrandTest\?\{/);
});

test('Grand Test uses the normal question option image answer and solution editor', () => {
  assert.match(frontend, /data-target="question"/);
  assert.match(frontend, /data-target="optA"/);
  assert.match(frontend, /id="correctOption"/);
  assert.match(frontend, /data-target="solutionText"/);
  assert.match(frontend, /setGrandTestEditMode\(q\)/);
});
