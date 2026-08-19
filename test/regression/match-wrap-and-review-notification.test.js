'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8').replace(/\r\n/g, '\n');
const bulkCss = fs.readFileSync(path.join(root, 'public/bulk-import.css'), 'utf8').replace(/\r\n/g, '\n');
const questionsRoute = fs.readFileSync(path.join(root, 'routes/questions.js'), 'utf8').replace(/\r\n/g, '\n');

test('Match display columns use overflow:visible and inline previews to prevent formula clipping', () => {
  assert.ok(html.includes('.match-display-column{\n  min-width:0;\n  width:100%;\n  box-sizing:border-box;\n  border:1px solid var(--border);\n  border-radius:8px;\n  background:#111;\n  overflow:visible;\n}'));
  assert.ok(html.includes('.match-display-value .li-preview{\n  display:inline;'));

  assert.ok(bulkCss.includes('.bq-match-column{min-width:0;width:100%;box-sizing:border-box;background:#111;border:1px solid #252525;border-radius:7px;overflow:visible;}'));
  assert.ok(bulkCss.includes('.bq-match-value{min-width:0;flex:1 1 0%;box-sizing:border-box;overflow:visible;white-space:normal;word-break:normal;overflow-wrap:break-word;}'));
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
