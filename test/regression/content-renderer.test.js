'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const renderer = require('../../public/content-renderer');

const latexCases = [
  'Cl\\_3C\\cdot CHO+NO\\rightarrow CHCl\\_3+NO+CO',
  '\\text{Rate}=k[Cl\\_3C\\cdot CHO][NO]',
  '\\frac{1}{16}', '\\sqrt{x}', '\\alpha+\\beta', '\\sum_{i=1}^{n}i',
  '\\int_0^1 x dx', '\\vec{F}', '\\infty', '\\partial x', '\\nabla f',
  '\\det(A)', 'K_c\\rightleftharpoons K_p',
];
for (const value of latexCases) test(`raw LaTeX is delimited once: ${value}`, () => {
  const rendered = renderer.ensureMathDelimiters(value);
  assert.equal(rendered, `$${value}$`);
  assert.equal(renderer.ensureMathDelimiters(rendered), rendered);
});

test('missing opening display delimiter is restored without changing surrounding text', () => {
  assert.equal(
    renderer.ensureMathDelimiters('\\int_0^1 x\\,dx \\] equals'),
    '\\[\\int_0^1 x\\,dx \\] equals'
  );
});

test('missing opening inline delimiter is restored without changing surrounding text', () => {
  assert.equal(
    renderer.ensureMathDelimiters('Value is \\frac{1}{2} \\) here'),
    'Value is \\(\\frac{1}{2} \\) here'
  );
});

test('bare LaTeX matrix environment is wrapped once', () => {
  const matrix = '\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}';
  assert.equal(renderer.ensureMathDelimiters(matrix), `$$${matrix}$$`);
});

test('already delimited LaTeX matrix environment is not double wrapped', () => {
  const matrix = '\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}';
  assert.equal(renderer.ensureMathDelimiters(`$ ${matrix} $`), `$ ${matrix} $`);
  assert.equal(renderer.ensureMathDelimiters(`$$${matrix}$$`), `$$${matrix}$$`);
});

test('malformed extra dollars around a LaTeX matrix are normalized for display only', () => {
  const matrix = '\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}';
  assert.equal(renderer.ensureMathDelimiters(`$${matrix}$$$`), `$${matrix}$`);
});

test('matrix inside a larger inline expression is not nested in display delimiters', () => {
  const value = '$A=\\begin{bmatrix}0&-i\\\\i&0\\end{bmatrix}$';
  assert.equal(renderer.ensureMathDelimiters(value), value);
});

test('extra closing dollars after an inline matrix are reduced to its opening delimiter', () => {
  const value = 'If $A=\\begin{bmatrix}0&-i\\\\i&0\\end{bmatrix}$$$, then $A^2=I$';
  assert.equal(
    renderer.ensureMathDelimiters(value),
    'If $A=\\begin{bmatrix}0&-i\\\\i&0\\end{bmatrix}$, then $A^2=I$'
  );
});

test('raw determinant ratio remains one complete inline expression', () => {
  const value = '\\dfrac{l}{\\begin{vmatrix}m_1&n_1\\\\m_2&n_2\\end{vmatrix}}=\\dfrac{-m}{\\begin{vmatrix}l_1&n_1\\\\l_2&n_2\\end{vmatrix}}';
  assert.equal(renderer.ensureMathDelimiters(value), `$${value}$`);
});

const markdownCases = ['Pending Review','Correct answer','Solution','Option A','A formula $x^2$'];
for (const value of markdownCases) test(`Markdown strong token preserves content: ${value}`, () => {
  assert.deepEqual(renderer.tokenizeMarkdown(`before **${value}** after`), [
    { type:'text', value:'before ' }, { type:'strong', value }, { type:'text', value:' after' }
  ]);
});

const attacks = ['<script>alert(1)</script>','<img src=x onerror=alert(1)>','javascript:alert(1)','<svg onload=alert(1)>','**<iframe src=x>**'];
for (const value of attacks) test(`malicious HTML remains inert text tokens: ${value}`, () => {
  const tokens = renderer.tokenizeMarkdown(value);
  assert.equal(tokens.map(token => token.value).join(''), value.replace(/^\*\*|\*\*$/g,''));
  assert.equal(tokens.some(token => token.type === 'html'), false);
});
