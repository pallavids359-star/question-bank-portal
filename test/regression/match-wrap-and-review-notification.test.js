'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8').replace(/\r\n/g, '\n');
const bulkCss = fs.readFileSync(path.join(root, 'public/bulk-import.css'), 'utf8').replace(/\r\n/g, '\n');
const questionsRoute = fs.readFileSync(path.join(root, 'routes/questions.js'), 'utf8').replace(/\r\n/g, '\n');

test('Match display columns contain long formulas without overlapping', () => {
  assert.ok(html.includes('.match-display-value .li-preview{\n  display:block;'));
  assert.match(html, /\.match-display-column\{[\s\S]*?overflow:hidden;/);
  assert.match(html, /\.match-display-value\{[\s\S]*?overflow-x:auto;/);
  assert.match(bulkCss, /\.bq-match-column\{[^\n]*overflow:hidden;/);
  assert.match(bulkCss, /\.bq-match-value\{[^\n]*overflow-x:auto;/);
});

test('Saved Questions applies existing smart math conversion after delimiter repair', () => {
  assert.match(html, /const normalized=smartConvertRaw\(ensureMathDelimiters\(raw\|\|''\)\);/);
});

test('Question update endpoint notifies original reviewer when question has an active review', () => {
  assert.match(questionsRoute, /router\.put\('\/:id'/);
  assert.match(questionsRoute, /in\('type', \['question_review', 'question_accepted', 'question_acceptance_reversed'\]\)/);
  assert.match(questionsRoute, /type === 'question_review'/);
  assert.match(questionsRoute, /type: 'question_updated'/);
  assert.match(questionsRoute, /title: 'Question Updated'/);
  assert.match(questionsRoute, /The question you reviewed has been updated by/);
  assert.match(questionsRoute, /recipient_id: reviewerId/);
});
