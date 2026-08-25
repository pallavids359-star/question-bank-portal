'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'routes/questions.js'), 'utf8');
const renderer = require('../../public/content-renderer');

function browserFunction(name, nextMarker) {
  const start = html.indexOf(`function ${name}`);
  const end = html.indexOf(nextMarker, start);
  assert.notEqual(start, -1, `${name} was not found`);
  assert.notEqual(end, -1, `${nextMarker} was not found after ${name}`);
  const context = {};
  vm.runInNewContext(`${html.slice(start, end)}; this.result = ${name};`, context);
  return context.result;
}

test('question text without final punctuation keeps its first line', () => {
  const getCleanQuestionText = browserFunction('getCleanQuestionText', 'function ensureMathDelimiters');
  const question = 'Growth of X is\ncontrolled by the following statements';
  assert.equal(getCleanQuestionText({ question, topic: 'Plant Growth' }), question);
});

test('plain Markdown fences are hidden from displayed solutions', () => {
  const solution = 'synergids. This directional growth is called chemotropism.\nTherefore, option (A) is correct.\n```\n```text';
  const rendered = renderer.ensureMathDelimiters(solution);
  assert.equal(rendered.includes('```'), false);
  assert.match(rendered, /Therefore, option \(A\) is correct\./);
});

test('stray text fences with invisible characters are hidden from displayed solutions', () => {
  const solution = 'Therefore, option (D) is correct.\n```\n\u200B```text';
  const rendered = renderer.ensureMathDelimiters(solution);
  assert.equal(rendered.includes('```'), false);
  assert.match(rendered, /Therefore, option \(D\) is correct\./);
});

test('frontend recovers statement variants without requiring final punctuation', () => {
  const extractStatementPairForForm = browserFunction('extractStatementPairForForm', 'let userNotifications');
  const pair = extractStatementPairForForm(
    'Statement-I: Growth of X is\nStatement (II): Auxin controls directional growth'
  );
  assert.equal(pair.statement1, 'Growth of X is');
  assert.equal(pair.statement2, 'Auxin controls directional growth');
});

test('backend uses the same statement-label variants', () => {
  assert.match(routes, /Statement\\s\*\[-–—\]\?\\s\*\\\(\?\\s\*\(\?:I\|1\|A\)/);
  assert.match(routes, /Statement\\s\*\[-–—\]\?\\s\*\\\(\?\\s\*\(\?:II\|2\|B\)/);
});
