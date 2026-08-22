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
