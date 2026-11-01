'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const bulkSource = fs.readFileSync(path.join(root, 'public/bulk-import.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const questions = fs.readFileSync(path.join(root, 'routes/questions.js'), 'utf8');
const matchDisplay = require('../../public/match-display');

function loadParser() {
  const values = {
    bqImportMode: 'chapter', bqMetaSubject: 'Physics', bqMetaClass: '12',
    bqMetaChapter: 'Alternating Current', bqMetaExam: 'NEET', bqMetaLanguage: 'English',
    bqMetaMarks: '4', bqMetaNegMarks: '1', bqMetaDiff: 'Medium',
  };
  const document = {
    getElementById(id) {
      if (id === 'bqMetaClass') return { value: values[id], options: [{ value: '11' }, { value: '12' }] };
      return Object.prototype.hasOwnProperty.call(values, id) ? { value: values[id] } : null;
    },
  };
  const window = { QPMatchDisplay: matchDisplay, BULK_NCERT_CHAPTERS: { 'Physics-12': ['Alternating Current'] } };
  vm.runInNewContext(bulkSource, { window, document, globalThis: window, console, setTimeout, clearTimeout });
  return window.parseText;
}

const AR_OPTIONS = `(A) Both A and R are true and R is the correct explanation of A
(B) Both A and R are true but R is not the correct explanation of A
(C) A is true but R is false
(D) A is false but R is true
Answer: A
Solution: Explanation.`;

const FORMATS = {
  'plain labels': `1. Assertion (A): First claim $x^2$.\nReason (R): Second claim.\n${AR_OPTIONS}`,
  'LaTeX \\textbf labels': `1. \\textbf{Assertion (A):} First claim $x^2$.\n\\textbf{Reason (R):} Second claim.\n${AR_OPTIONS}`,
  'markdown bold labels': `1. **Assertion (A):** First claim $x^2$.\n**Reason (R):** Second claim.\n${AR_OPTIONS}`,
  'A: / R: labels': `1. A: First claim $x^2$.\nR: Second claim.\n${AR_OPTIONS}`,
  'both on one line': `1. Assertion (A): First claim $x^2$. Reason (R): Second claim.\n${AR_OPTIONS}`,
};

for (const [name, text] of Object.entries(FORMATS)) {
  test(`Assertion-Reason is recognised with ${name}`, () => {
    const [q] = loadParser()(text);
    assert.equal(q.qType, 'assertion_reason');
    assert.equal(q.assertion, 'First claim $x^2$.');
    assert.equal(q.reason, 'Second claim.');
    assert.match(q.optA, /^Both A and R are true and R is the correct explanation/);
    assert.match(q.optD, /^A is false but R is true/);
    assert.equal(q.answer, 'A');
  });
}

test('A:/B:/C:/D: option lists are not treated as Assertion-Reason', () => {
  const [q] = loadParser()(`1. Which is a noble gas?\nA: Neon\nB: Oxygen\nC: Nitrogen\nD: Hydrogen\nAnswer: A`);
  assert.notEqual(q.qType, 'assertion_reason');
});

test('Saved Questions shows KCET questions and offers KCET as an exam type', () => {
  assert.doesNotMatch(questions, /excludeKcetOnlyQuestions/);
  assert.doesNotMatch(html, /if\(kcetOnly\)return false;/);
  assert.doesNotMatch(html, /\.filter\(exam=>exam!=='KCET'\)/);
  assert.match(questions, /const SAVED_QUESTION_EXAMS = \['NEET', 'JEE', 'KCET', 'NEET\/JEE'\]/);
});
