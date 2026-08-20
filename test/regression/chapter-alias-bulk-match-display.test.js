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
  assert.match(html, /var chapters = BULK_NCERT_CHAPTERS\[key\] \|\| \[\];/);
  assert.match(html, /bulkClassEl\.addEventListener\('change', updateBulkChapterOptions\)/);
  assert.doesNotMatch(html, /<input[^>]+id="bqMetaChapter"/);
});

test('requested chapter aliases are display-only and canonical dropdown names are present', () => {
  const requiredMappings = [
    '"geometric optics/ray optics": "Ray Optics And Optical Instruments"',
    '"units and measurement": "Units and Measurements"',
    '"current electricity (metre bridge, practical skills)": "Current Electricity"',
    '"digital electronics": "Semiconductor Electronics: Materials, Devices and Simple Circuits"',
    '"electrostatic potential & capacitance": "Electrostatic Potential and Capacitance"',
    '"moving coil galvanometer": "Moving Charges and Magnetism"',
    '"geometric optics": "Ray Optics And Optical Instruments"',
    '"ray optics": "Ray Optics And Optical Instruments"',
    '"magnetism and mater": "Magnetism and Matter"',
    '"moving charges & magnetism": "Moving Charges and Magnetism"',
    '"magnetic effects of current": "Moving Charges and Magnetism"',
    '"magnetic force and motion of charge": "Moving Charges and Magnetism"',
    '"d and f block elements": "The d- and f- block Elements"',
    '"3d geometry": "Three Dimensional Geometry"',
    '"3d geomerty": "Three Dimensional Geometry"',
    '"three dimensional geometry": "Three Dimensional Geometry"',
    '"application of derivative": "Application of Derivatives"',
    '"application of derivatives": "Application of Derivatives"',
    '"algebra of derivatives": "Application of Derivatives"',
    '"derivative as rate measure": "Application of Derivatives"',
    '"geometrical interpretation of a derivative": "Application of Derivatives"',
    '"area": "Application of Integrals"',
    '"definite integration": "Integrals"',
    '"fundamental theorem of definite integration": "Integrals"',
    '"definite integration of odd-even and periodic functions": "Integrals"',
    '"exponential and logarithmic functions": "Continuity and Differentiability"',
    '"vectors": "Vector Algebra"',
    '"trigonometric ratios": "Trigonometric Functions"',
    '"organic chemistry: some basic principles and techniques": "Organic Chemistry - Some Basic Principles and Techniques"',
    '"chemical thermodynamics": "Thermodynamics"',
    '"spontaneity": "Thermodynamics"',
    '"thermodynamics & thermochemistry": "Thermodynamics"',
    '"thermodynamics and thermochemistry": "Thermodynamics"',
    '"bond parameters": "Chemical Bonding and Molecular Structure"',
    '"common names of organic compounds": "Organic Chemistry - Some Basic Principles and Techniques"',
    '"de broglie concept principle and heisenberg uncertainty principle": "Structure of Atom"',
    '"alcohols phenols and ethers": "Alcohols, Phenols and Ethers"',
    '"human health and diseases": "Human Health and Disease"'
  ];
  requiredMappings.forEach(mapping => assert.ok(html.includes(mapping), mapping));
  assert.match(html, /function chapterDisplayName\(subject, klass, chapter\)/);
  assert.doesNotMatch(html, /fetch\([^)]*chapter.*(?:UPDATE|DELETE)/i);
});

test('bulk import chapter assignment comes only from the selected dropdown', () => {
  assert.match(bulkJs, /function selectedBulkChapter\(meta\)/);
  assert.match(bulkJs, /window\.BULK_NCERT_CHAPTERS/);
  assert.match(bulkJs, /const finalChapter = selectedBulkChapter\(meta\);/);
  assert.doesNotMatch(bulkJs, /const finalChapter = inline\.chapter \|\| overrides\.chapter \|\| meta\.chapter;/);
  assert.equal((bulkJs.match(/chapter: selectedChapter,/g) || []).length, 2);
  assert.doesNotMatch(bulkJs, /chapter: q\.chapter \|\| meta\.chapter/);
  assert.match(bulkJs, /Chapter must be selected from the dropdown\./);
  assert.match(bulkJs, /Select a valid chapter from the dropdown\./);
  assert.match(bulkJs, /chapterSelect\.addEventListener\('change', runParse\)/);
});

test('saved questions and bulk previews render match columns vertically', () => {
  assert.match(html, /className='match-columns-display'/);
  assert.match(html, /className='match-display-row'/);
  assert.doesNotMatch(html, /document\.createTextNode\(' \| '\)/);
  assert.match(bulkJs, /className = 'bq-match-columns'/);
  assert.match(bulkJs, /className = 'bq-match-row'/);
  assert.match(bulkCss, /\.bq-match-columns\{display:grid/);
});
