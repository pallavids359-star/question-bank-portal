const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(
  path.join(__dirname, '../../public/index.html'),
  'utf8'
);

function extractChapterMap() {
  const match = html.match(/const NCERT_CHAPTERS = (\{[\s\S]*?\n\});\nconst EXAMS/);
  assert.ok(match, 'NCERT_CHAPTERS catalogue must exist');
  return Function(`"use strict"; return (${match[1]});`)();
}

test('NCERT catalogue contains all 116 Physics, Chemistry, Mathematics and Biology chapters', () => {
  const chapters = extractChapterMap();
  const canonicalKeys = [
    'Physics-11', 'Physics-12',
    'Chemistry-11', 'Chemistry-12',
    'Mathematics-11', 'Mathematics-12',
    'Biology-11', 'Biology-12'
  ];

  assert.deepEqual(
    canonicalKeys.map(key => chapters[key].length),
    [15, 14, 13, 15, 14, 13, 19, 13]
  );
  assert.equal(
    canonicalKeys.reduce((total, key) => total + chapters[key].length, 0),
    116
  );
});

test('chapter catalogue is selected only by subject and class', () => {
  assert.match(html, /var key = subject \+ '-' \+ klass;/);
  assert.match(html, /var chapters = NCERT_CHAPTERS\[key\] \|\| \[\];/);
  assert.match(html, /subjectEl\.addEventListener\('change',[\s\S]*?updateChapterOptions\(\)/);
  assert.match(html, /klassEl\.addEventListener\('change', updateChapterOptions\)/);
});

test('an existing non-catalogue chapter remains selectable without changing its stored value', () => {
  assert.match(html, /customOpt\.value = targetVal;/);
  assert.match(html, /customOpt\.textContent = 'Current chapter: ' \+ targetVal;/);
  assert.match(html, /chapterEl\.value = targetVal;/);
  assert.match(html, /updateChapterOptions\(q\.chapter \|\| ''\)/);
});

test('syllabus catalogue code contains no database mutation or automatic reassignment', () => {
  const catalogue = html.match(/const NCERT_CHAPTERS = [\s\S]*?\n};\nconst EXAMS/);
  const dropdown = html.match(/function updateChapterOptions\(presetChapter\) \{[\s\S]*?\n}\nwindow\.updateChapterOptions/);
  assert.ok(catalogue, 'syllabus catalogue must be present');
  assert.ok(dropdown, 'chapter dropdown updater must be present');
  assert.doesNotMatch(
    catalogue[0] + dropdown[0],
    /apiReq\s*\(|fetch\s*\(|\.update\s*\(|\.delete\s*\(|UPDATE\s+|DELETE\s+/i
  );
});
