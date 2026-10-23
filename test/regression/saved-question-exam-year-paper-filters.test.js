'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const frontend = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const questions = fs.readFileSync(path.join(root, 'routes', 'questions.js'), 'utf8');

test('Saved Questions has an Exam Type filter sent to the server', () => {
  assert.match(frontend, /<select id="fExam" title="Filter by exam type">/);
  assert.match(frontend, /if\(examFilter\)params\.set\('exam',examFilter\)/);
  assert.match(questions, /if \(examValues\.length\) query = query\.overlaps\('exams', examValues\)/);
  assert.match(questions, /if \(value === 'NEET' \|\| value === 'JEE'\) return \[value, 'NEET\/JEE'\]/);
});

test('Year dropdown appears only for Previous Year questions', () => {
  assert.match(frontend, /<select id="fYear" title="Filter Previous Year questions by year" style="display:none;">/);
  assert.match(frontend, /savedFilterYear\.style\.display=previousYearSet\?'':'none'/);
  assert.match(frontend, /const yearFilter=questionSet==='previous_year'\?/);
  assert.match(questions, /if \(questionSet === 'previous_year' && \/\^\\d\{4\}\$\/\.test\(year\)\) query = query\.eq\('year', year\)/);
  assert.match(questions, /years: questionSet === 'previous_year'/);
});

test('Grand Test and Previous Year keep Class and Chapter dropdowns enabled', () => {
  assert.match(frontend, /\[savedFilterClass,savedFilterChapter\]\.forEach\(select=>\{/);
  assert.match(frontend, /savedFilterConcept\.disabled=paperSet/);
  assert.match(frontend, /const qChapter=paperMeta\?paperMeta\.chapter:q\.chapter/);
});

test('Paper-set Class/Chapter filters use metadata, not the chapter column', () => {
  assert.match(questions, /if \(!paperSet && chapter\) query = query\.eq\('chapter', chapter\)/);
  assert.match(questions, /const paperFilters = paperSetMetadataFilters\(req\.query\)/);
  assert.match(questions, /\.filter\(question => matchesPaperSetMetadata\(question, paperFilters\)\)/);
  assert.match(questions, /const chapter = isPaperQuestionSet\(questionSet\) \? '' :/);
});
