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

test('plain prose accidentally fenced as math remains prose', () => {
  assert.equal(renderer.ensureMathDelimiters('```math\nso\n```'), 'so');
  assert.equal(renderer.ensureMathDelimiters('```math\nThe solution through\n```'), 'The solution through');
});

test('inline-code LaTeX and variables render as math without joining prose', () => {
  const value = 'not differentiable at `x=1` and `\\cos|x|` is differentiable for all `x`.';
  assert.equal(
    renderer.ensureMathDelimiters(value),
    'not differentiable at $x=1$ and $\\cos|x|$ is differentiable for all x.'
  );
});

test('common orphan inline dollar signs are paired for solution display', () => {
  assert.equal(
    renderer.ensureMathDelimiters('At x=1$ and $x=-1 gives the result.'),
    'At $x=1$ and $x=-1$ gives the result.'
  );
});

test('a trailing orphan dollar wraps a complete numerical answer containing brackets', () => {
  assert.equal(
    renderer.ensureMathDelimiters('y=(1+x^2)\\left[F(x)-F(1)\\right]$, where'),
    '$y=(1+x^2)\\left[F(x)-F(1)\\right]$, where'
  );
});

test('legacy permutation and combination notation is normalized for KaTeX display', () => {
  assert.equal(
    renderer.ensureMathDelimiters('^6C\\_3\\times\\\\,^4C\\_2'),
    '${}^{6}C_{3}\\times\\,{}^{4}C_{2}$'
  );
  assert.equal(
    renderer.ensureMathDelimiters('If ^nP\\_r=\\,^nP\\_{r+1} then'),
    'If {}^{n}P_{r}=\\,{}^{n}P_{r+1} then'
  );
});

test('stray Markdown backticks are removed from displayed solution text', () => {
  assert.equal(renderer.ensureMathDelimiters('Therefore, `option A` is correct. ```'), 'Therefore, option A is correct. ');
});

test('legacy product notation keeps prose outside math and repairs squared differences', () => {
  const source = 'If P=21\\left(21^{2-}1^2\\right)\\left(21^{2-}10^2\\right)`then`P$ is divisible by';
  assert.equal(
    renderer.ensureMathDelimiters(source),
    'If $P=21\\left(21^2-1^2\\right)\\left(21^2-10^2\\right)$ then $P$ is divisible by'
  );
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
