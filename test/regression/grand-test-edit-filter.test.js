'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const frontend = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'index.html'), 'utf8');
const questions = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'questions.js'), 'utf8');

test('Saved Questions has explicit chapter-wise and Grand Test views', () => {
  assert.match(frontend, /id="fQuestionSet"/);
  // Chapter-wise is the default; there is no "All Question Sets" view.
  assert.match(frontend, /value="chapter" selected>Chapter-wise Questions/);
  assert.doesNotMatch(frontend, />All Question Sets</);
  assert.match(frontend, /value="grand_test">Grand Test Questions/);
  assert.match(frontend, /params\.set\('questionSet',questionSet\)/);
  assert.match(questions, /questionSet === 'grand_test'/);
  // Default and chapter-wise views always exclude Grand Test / Previous Year rows.
  assert.match(questions, /Chapter-wise \(and the default, no set chosen\)/);
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
