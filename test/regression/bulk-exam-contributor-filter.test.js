'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const bulkJs = fs.readFileSync(path.join(root, 'public/bulk-import.js'), 'utf8');
const questionRoutes = fs.readFileSync(path.join(root, 'routes/questions.js'), 'utf8');

test('bulk import offers and stores the combined NEET/JEE exam category', () => {
  assert.match(html, /allowed\.push\('NEET\/JEE'\)/);
  assert.match(questionRoutes, /\[\.\.\.allowed, 'NEET\/JEE'\]/);
  assert.match(bulkJs, /exams:\s+eEl && eEl\.value \? \[eEl\.value\.trim\(\)\]/);
  assert.ok((bulkJs.match(/exams:\s+meta\.exams,/g) || []).length >= 2);
  assert.doesNotMatch(bulkJs, /exams:\s+q\.exams && q\.exams\.length/);
});

test('normal Add New Question offers NEET/JEE for Physics and Chemistry', () => {
  assert.match(html, /function allowedEntryExamsForSubject\(subject\)/);
  assert.match(html, /\['Physics', 'Chemistry'\]\.includes\(canonical\)/);
  assert.match(html, /allowed\.push\('NEET\/JEE'\)/);
  assert.match(html, /const allowed = allowedEntryExamsForSubject\(subject\);/);
  assert.match(html, /const allowedExams=allowedEntryExamsForSubject\(subjectSel\.value\);/);
});

test('bulk preview edits remain authoritative until import', () => {
  assert.match(bulkJs, /function openCardEditor\(idx\)[\s\S]*?clearTimeout\(state\.debounceTimer\);[\s\S]*?state\.debounceTimer = null;/);
  assert.match(bulkJs, /function saveCardEditor\(\)[\s\S]*?q\.solutionText = gVal\('bqEditSolution'\);[\s\S]*?checkPreviousImports\(state\.parsedQuestions, requestId\)/);
});

test('bulk image upload retains its field target until the asynchronous read completes', () => {
  assert.match(html, /const targetId = _bqTarget;/);
  assert.match(html, /document\.getElementById\(targetId\)/);
  assert.match(html, /const previewId = targetId \+ 'ImgPreview';/);
});

test('bulk preview and Saved Questions use the same LaTeX delimiter repair', () => {
  assert.match(bulkJs, /window\.QbpContentRenderer\.ensureMathDelimiters\(text\)/);
});

test('KCET bulk selection applies one mark and zero negative marks', () => {
  assert.match(html, /const isKcet = exam\.value === 'KCET';/);
  assert.match(html, /marks\.value = isKcet \? '1' : '4';/);
  assert.match(html, /negativeMarks\.value = isKcet \? '0' : '1';/);
  assert.match(html, /bulkExamEl\.addEventListener\('change', updateBulkMarksForExam\)/);
});

test('Saved Questions supports name-wise Adder and Admin filtering', () => {
  assert.match(html, /id="fContributor"/);
  assert.match(html, /\[\['adder','Adders'\],\['admin','Admins'\]\]/);
  assert.match(html, /option\.value=contributor\.id/);
  assert.match(html, /createdBy:'fContributor'/);
  assert.match(questionRoutes, /query\.eq\('created_by', createdBy\)/);
  assert.match(questionRoutes, /contributors,/);
});

test('contributor facets do not retrieve question content or embedded images', () => {
  assert.match(
    questionRoutes,
    /\.select\('subject, klass, chapter, topic'\)/
  );
  assert.doesNotMatch(questionRoutes, /\.select\('subject, klass, chapter, topic, created_by/);
});
