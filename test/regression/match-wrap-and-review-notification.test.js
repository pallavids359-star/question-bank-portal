'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8').replace(/\r\n/g, '\n');
const bulkCss = fs.readFileSync(path.join(root, 'public/bulk-import.css'), 'utf8').replace(/\r\n/g, '\n');
const questionsRoute = fs.readFileSync(path.join(root, 'routes/questions.js'), 'utf8').replace(/\r\n/g, '\n');

test('Match display columns show content directly without internal scrollbars', () => {
  assert.ok(html.includes('.match-display-value .li-preview{\n  display:block;'));
  assert.match(html, /if\(q\.qType==='match'\)item\.classList\.add\('match-question'\);/);
  assert.match(html, /\.list-item\.match-question \.li-top\{\s*flex-direction:column;/);
  assert.match(html, /\.list-item\.match-question \.li-top>div:first-child\{\s*width:100%;/);
  assert.match(html, /\.list-item\.match-question \.li-btns\{[\s\S]*?align-self:flex-end;[\s\S]*?max-width:none;/);
  assert.match(html, /\.match-display-column\{[\s\S]*?overflow:visible;[\s\S]*?max-height:none;/);
  assert.match(html, /\.match-display-value\{[^}]*overflow:visible;/);
  assert.doesNotMatch(html, /\.match-display-value\{[^}]*overflow-x:auto;/);
  assert.match(bulkCss, /\.bq-match-column\{[^\n]*overflow:hidden;/);
  assert.match(bulkCss, /\.bq-match-value\{[^\n]*overflow:visible;/);
  assert.doesNotMatch(bulkCss, /\.bq-match-value\{[^\n]*overflow-x:auto;/);
});

test('Saved Questions applies existing smart math conversion after delimiter repair', () => {
  assert.match(html, /const normalized=smartConvertRaw\(ensureMathDelimiters\(raw\|\|''\)\);/);
});

test('Saved Match the Following cards display the question stem above both columns', () => {
  assert.match(html, /const matchQuestionStem=getMatchQuestionStem\(cleanQText\);[\s\S]*?if\(matchQuestionStem\)\{[\s\S]*?questionBlock\.className='match-question-block';[\s\S]*?main\.appendChild\(questionBlock\);[\s\S]*?const columns=/);
  assert.match(html, /\.match-question-block\{[^}]*margin-bottom:10px;/);
});

test('Match question instruction is optional and does not repeat embedded legacy columns', () => {
  assert.match(html, /id="matchQuestion"[^>]*data-placeholder="e\.g\. Match the List I with List II\."/);
  assert.doesNotMatch(html, /if\(isMatch && !mainQuestionText\) mainQuestionText = 'Match the Following Question';/);
  assert.match(html, /function getMatchQuestionStem\(questionText\)[\s\S]*?const columnStart=/);
  assert.match(html, /setFieldFromRaw\('matchQuestion', getMatchQuestionStem\(q\.question\|\|''\)\);/);
});

test('Question update endpoint notifies original reviewer when question has an active review', () => {
  assert.match(questionsRoute, /router\.put\('\/:id'/);
  assert.match(questionsRoute, /in\('type', \['question_review', 'question_accepted', 'question_acceptance_reversed'\]\)/);
  assert.match(questionsRoute, /type === 'question_review'/);
  assert.match(questionsRoute, /type: 'question_updated'/);
  assert.match(questionsRoute, /title: 'Question Updated'/);
  assert.match(questionsRoute, /The question you reviewed has been updated by/);
  assert.match(questionsRoute, /recipient_id: reviewerId/);
  assert.match(questionsRoute, /\.delete\(\)\s*\.eq\('question_id', req\.params\.id\)\s*\.eq\('type', 'question_review'\)/);
});
