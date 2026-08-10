const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const bulkJs = fs.readFileSync(path.join(root, 'public/bulk-import.js'), 'utf8');
const bulkCss = fs.readFileSync(path.join(root, 'public/bulk-import.css'), 'utf8');

test('bulk metadata uses a subject and class dependent chapter dropdown', () => {
  assert.match(html, /<select id="bqMetaChapter"/);
  assert.match(html, /function updateBulkChapterOptions\(presetChapter\)/);
  assert.match(html, /bulkClassEl\.addEventListener\('change', updateBulkChapterOptions\)/);
  assert.doesNotMatch(html, /<input[^>]+id="bqMetaChapter"/);
});

test('requested chapter aliases are display-only and canonical dropdown names are present', () => {
  const requiredMappings = [
    '"geometric optics/ray optics": "Ray Optics and Optical Instruments"',
    '"magnetic effects of current": "Moving Charges and Magnetism"',
    '"magnetic force and motion of charge": "Moving Charges and Magnetism"',
    '"d and f block elements": "The d- and f- block Elements"',
    '"3d geometry": "Three-dimensional Geometry"',
    '"three dimensional geometry": "Three-dimensional Geometry"',
    '"application of derivatives": "Applications of Derivatives"',
    '"exponential and logarithmic functions": "Continuity and Differentiability"',
    '"thermodynamics and thermochemistry": "Chemical Thermodynamics"'
  ];
  requiredMappings.forEach(mapping => assert.ok(html.includes(mapping), mapping));
  assert.match(html, /function chapterDisplayName\(subject, klass, chapter\)/);
  assert.doesNotMatch(html, /fetch\([^)]*chapter.*(?:UPDATE|DELETE)/i);
});

test('saved questions and bulk previews render match columns vertically', () => {
  assert.match(html, /className='match-columns-display'/);
  assert.match(html, /className='match-display-row'/);
  assert.doesNotMatch(html, /document\.createTextNode\(' \| '\)/);
  assert.match(bulkJs, /className = 'bq-match-columns'/);
  assert.match(bulkJs, /className = 'bq-match-row'/);
  assert.match(bulkCss, /\.bq-match-columns\{display:grid/);
});
