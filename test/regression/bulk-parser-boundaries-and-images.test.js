'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const bulkSource = fs.readFileSync(path.join(root, 'public/bulk-import.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const matchDisplay = require('../../public/match-display');

function loadParser() {
  const values = {
    bqImportMode: 'chapter',
    bqMetaSubject: 'Physics',
    bqMetaClass: '12',
    bqMetaChapter: 'Alternating Current',
    bqMetaExam: 'NEET',
    bqMetaLanguage: 'English',
    bqMetaMarks: '4',
    bqMetaNegMarks: '1',
    bqMetaDiff: 'Medium',
  };
  const document = {
    getElementById(id) {
      if (id === 'bqMetaClass') {
        return { value: values[id], options: [{ value: '11' }, { value: '12' }] };
      }
      return Object.prototype.hasOwnProperty.call(values, id) ? { value: values[id] } : null;
    },
  };
  const window = {
    QPMatchDisplay: matchDisplay,
    BULK_NCERT_CHAPTERS: { 'Physics-12': ['Alternating Current'] },
  };
  const context = { window, document, globalThis: window, console, setTimeout, clearTimeout };
  vm.runInNewContext(bulkSource, context);
  return window.parseText;
}

test('leading plain question numbers are removed from imported question text', () => {
  const [question] = loadParser()(`
1. The value of $\\lim_{x\\to0} x$ equals
(A) 0
(B) 1
(C) 2
(D) 3
Answer: A
  `);
  assert.equal(question.question.startsWith('1.'), false);
  assert.match(question.question, /^The value of/);
});

test('match parser keeps multiline wording together and allows more Column B rows', () => {
  const [question] = loadParser()(`
@type: Match the Following
Match each entry.
Column A
(1) First entry
(2) $$\\log_5 \\tan x = (\\log_5
(\\log_4(3 \\sin x))
)$$
Column B
(P) First value
(Q) Second value
(R) Extra third value
Options
(A) 1-P, 2-Q
(B) 1-Q, 2-P
(C) 1-R, 2-Q
(D) 1-P, 2-R
Answer: A
  `);

  assert.equal(question.qType, 'match');
  assert.equal(question.columnA.length, 2);
  assert.equal(question.columnB.length, 3);
  assert.match(question.columnA[1], /log_4/);
  assert.match(question.columnA[1], /\)\$\$/);
});

test('explicit Assertion/Reason and Statement labels determine their correct type', () => {
  const [assertionReason] = loadParser()(`
@type: Statement Based
Assertion: The function is continuous.
Reason: Its left and right limits are equal.
(A) Both are true
(B) Both are false
(C) A true, R false
(D) A false, R true
Answer: A
  `);
  assert.equal(assertionReason.qType, 'assertion_reason');
  assert.equal(assertionReason.assertion, 'The function is continuous.');

  const [statement] = loadParser()(`
@type: Assertion Reason
Statement I The sequence is increasing.
Statement II Every term is positive.
(A) Both statements are true
(B) Only Statement-1 is true
(C) Only Statement-2 is true
(D) Both statements are false
Answer: A
  `);
  assert.equal(statement.qType, 'statement_based');
  assert.equal(statement.statement1, 'The sequence is increasing.');
  assert.equal(statement.statement2, 'Every term is positive.');
});

test('question editors retain image attachment controls and serialized image markers', () => {
  assert.match(html, /data-bq-target="bqEditAssertion"/);
  assert.match(html, /data-bq-target="bqEditReason"/);
  assert.match(html, /field\.id=containerId\+'Field'\+idx/);
  assert.match(html, /attach\.dataset\.target=field\.id/);
  assert.match(html, /raw\+='\{\{IMG::'\+\(img\?img\.getAttribute\('src'\):''\)\+'\}\}'/);
  assert.match(html, /node\.tagName==='IMG'.*raw\+='\{\{IMG::'\+src\+'\}\}'/);
  assert.match(html, /await pendingQuestionImageWork;\s*const err=validate\(\)/);
});

test('Ctrl+V image paste converts clipboard images to persistent image markers', () => {
  assert.match(html, /if \(!dataUrl\.startsWith\('data:image'\) && \/\^\(\?:blob:\|https\?:\)\/i\.test\(dataUrl\)\)/);
  assert.match(html, /const blob = await response\.blob\(\)/);
  assert.match(html, /reader\.readAsDataURL\(blob\)/);
  assert.match(html, /targetEl\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  assert.match(html, /htmlText && \/<img\\b\/i\.test\(htmlText\)/);
});

test('plain blank underscores are not converted into red KaTeX errors', () => {
  assert.match(html, /if\(\/\^_\{2,\}\$\/\.test\(core\)\)return\{converted:false\}/);
  assert.match(html, /\\s\+_\(\?!_\{2,\}\)/);
});
