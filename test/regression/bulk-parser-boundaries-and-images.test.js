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

test('match rows use option-aware A-D and p-s labels without splitting formula tokens', () => {
  const [question] = loadParser()(`
@type: Match the Following
Match the following.
Column A
(A) If $\\lambda$ denotes the number of terms in $(1+5x+10x^2)^3$
(B) Second complete entry
(C) Third complete entry
(D) Fourth complete entry
Column B
(p) First value
(q) Second value
(r) Third value
(s) Fourth value
Options
(A) A-r, B-p, C-s, D-q
(B) A-p, B-r, C-s, D-q
(C) A-q, B-p, C-r, D-s
(D) A-s, B-q, C-p, D-r
Answer: A
  `);

  assert.equal(question.columnA.length, 4);
  assert.equal(question.columnB.length, 4);
  assert.match(question.columnA[0], /\(1\+5x\+10x\^2\)\^3/);
  assert.deepEqual(Array.from(matchDisplay.labelsFor(question, 'left', 4)), ['A', 'B', 'C', 'D']);
  assert.deepEqual(Array.from(matchDisplay.labelsFor(question, 'right', 4)), ['p', 'q', 'r', 's']);
});

test('match parser accepts compact shuffled labels and unequal column lengths', () => {
  const [question] = loadParser()(`
@type: Match the Following
Match the following.
Column 1
(B) Second entry (A) First entry (C) Third entry
Column 2
(q) Second value (p) First value (s) Fourth value (r) Third value
Options
(A) A-p, B-q, C-r
(B) A-q, B-p, C-s
(C) A-r, B-s, C-p
(D) A-s, B-r, C-q
Answer: A
  `);

  assert.deepEqual(Array.from(question.columnA), ['First entry', 'Second entry', 'Third entry']);
  assert.deepEqual(Array.from(question.columnB), ['First value', 'Second value', 'Third value', 'Fourth value']);
  assert.deepEqual(Array.from(matchDisplay.labelsFor(question, 'left', 3)), ['A', 'B', 'C']);
  assert.deepEqual(Array.from(matchDisplay.labelsFor(question, 'right', 4)), ['p', 'q', 'r', 's']);
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

test('Assertion and Reason retain multiline displayed mathematics until their next structural label', () => {
  const [question] = loadParser()(`
@type: Assertion Reason
Assertion: If
$$
x={}^{n}C_{n-1}+{}^{n+1}C_{n-1}+{}^{2n}C_{n-1},
$$
then
$$
\\frac{x+1}{2n+1}
$$
is an integer.
Reason:
$$
{}^nC_r+{}^nC_{r-1}={}^{n+1}C_r
$$
and \${}^nC_r$ is divisible by $n$ if $n$ and $r$ are co-prime.
(A) Both Assertion and Reason are true and Reason is the correct explanation of Assertion.
(B) Both Assertion and Reason are true but Reason is not the correct explanation of Assertion.
(C) Assertion is true but Reason is false.
(D) Assertion is false but Reason is true.
Answer: A
Solution: By the hockey-stick identity,
$$
x={}^{2n+1}C_n-1.
$$
Therefore, option A is correct.
  `);

  assert.equal(question.qType, 'assertion_reason');
  assert.match(question.assertion, /^If\n\$\$/);
  assert.match(question.assertion, /\\frac\{x\+1\}\{2n\+1\}/);
  assert.match(question.assertion, /is an integer\.$/);
  assert.match(question.reason, /\{\}\^nC_r\+\{\}\^nC_\{r-1\}/);
  assert.match(question.reason, /co-prime\.$/);
  assert.match(question.solutionText, /hockey-stick identity/);
  assert.match(question.solutionText, /option A is correct\.$/);
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
  assert.match(
    html,
    /'question', 'optA', 'optB', 'optC', 'optD', 'solutionText',[\s\S]*'assertion', 'reason', 'predefOptions',[\s\S]*'numQuestion', 'numAnswer', 'statement1', 'statement2'[\s\S]*\.forEach\(attachEquationField\)/
  );
});

test('plain blank underscores are not converted into red KaTeX errors', () => {
  assert.match(html, /if\(\/\^_\{2,\}\$\/\.test\(core\)\)return\{converted:false\}/);
  assert.match(html, /\\s\+_\(\?!_\{2,\}\)/);
});
