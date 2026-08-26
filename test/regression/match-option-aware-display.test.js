const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const matchDisplay = require(path.join(__dirname, '../../public/match-display.js'));

test('match labels are derived from each question option mapping', () => {
  const q = {
    matchOptions: {
      A: 'A-S, B-R, C-Q, D-P',
      B: 'A-P, B-Q, C-R, D-S',
      C: 'A-Q, B-R, C-S, D-P',
      D: 'A-S, B-Q, C-R, D-P'
    }
  };
  assert.deepEqual(matchDisplay.labelsFor(q, 'left', 4), ['A', 'B', 'C', 'D']);
  assert.deepEqual(matchDisplay.labelsFor(q, 'right', 4), ['P', 'Q', 'R', 'S']);
  assert.equal(matchDisplay.formatMapping(q.matchOptions.A), 'A → S, B → R, C → Q, D → P');
});

test('ordinary Biology phrases remain one row', () => {
  assert.deepEqual(matchDisplay.extractExplicitRows('(a) Broad shaped space'), ['Broad shaped space']);
  assert.deepEqual(matchDisplay.extractExplicitRows('towards the concave centre of the kidney'), []);
  assert.deepEqual(matchDisplay.extractExplicitRows('(a) Prawn (b) Cockroach (c) Earthworm (d) Flatworms'), [
    'Prawn', 'Cockroach', 'Earthworm', 'Flatworms'
  ]);
});

test('mixed formula markers do not split a labeled match row', () => {
  assert.deepEqual(
    matchDisplay.extractSequentialRows('(A) If n is defined by (1) and evaluated at (2)'),
    []
  );
  assert.deepEqual(
    matchDisplay.extractSequentialRows('(a) Prawn (b) Cockroach (c) Earthworm (d) Flatworms'),
    ['Prawn', 'Cockroach', 'Earthworm', 'Flatworms']
  );
});

test('compact match rows accept shuffled numeric, alphabetic and Roman label sequences', () => {
  assert.deepEqual(
    matchDisplay.extractSequentialRows('(2) Second row (1) First row (3) Third row'),
    ['First row', 'Second row', 'Third row']
  );
  assert.deepEqual(
    matchDisplay.extractSequentialRows('(q) Second value (p) First value (s) Fourth value (r) Third value'),
    ['First value', 'Second value', 'Third value', 'Fourth value']
  );
  assert.deepEqual(
    matchDisplay.extractSequentialRows('(iii) Third value (i) First value (iv) Fourth value (ii) Second value'),
    ['First value', 'Second value', 'Third value', 'Fourth value']
  );
});

test('numeric and lowercase mappings retain their own label scheme', () => {
  const q = { matchOptions: { A: '1-d, 2-c, 3-b, 4-a' } };
  assert.deepEqual(matchDisplay.labelsFor(q, 'left', 4), ['1', '2', '3', '4']);
  assert.deepEqual(matchDisplay.labelsFor(q, 'right', 4), ['a', 'b', 'c', 'd']);
});

test('Roman numeral Column B labels are displayed in numeric order', () => {
  const fourRows = { matchOptions: { A: 'a-ii, b-iii, c-iv, d-i' } };
  assert.deepEqual(matchDisplay.labelsFor(fourRows, 'right', 4), ['i', 'ii', 'iii', 'iv']);

  const fiveRows = { matchOptions: { A: 'a-v, b-iv, c-ii, d-i', B: 'a-i, b-ii, c-iii, d-v' } };
  assert.deepEqual(matchDisplay.labelsFor(fiveRows, 'right', 5), ['i', 'ii', 'iii', 'iv', 'v']);
});

test('saved match display preserves and orders all ten rows', () => {
  const romanLabels = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
  const mappings = romanLabels.map((label, index) => `${index + 1}-${label}`).join(', ');
  const question = { matchOptions: { A: mappings } };
  const rows = romanLabels.map(label => `Value ${label}`);

  assert.deepEqual(matchDisplay.labelsFor(question, 'left', 10), [
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'
  ]);
  assert.deepEqual(matchDisplay.labelsFor(question, 'right', 10), romanLabels);
  assert.deepEqual(matchDisplay.reconstructEntries(question, 'right', rows).entries, rows);
});

test('legacy Biology word fragments are reconstructed using each question mapping count', () => {
  const nephron = {
    matchOptions: {
      A: 'A-R, B-P, C-S, D-Q',
      B: 'A-R, B-S, C-Q, D-P',
      C: 'A-Q, B-P, C-S, D-R',
      D: 'A-R, B-P, C-Q, D-S'
    }
  };
  assert.deepEqual(
    matchDisplay.reconstructEntries(nephron, 'right', [
      'Long', 'extends', 'cortex', 'kidneys', 'inner medulla',
      'Maintain', 'potassium', 'in blood',
      'Maintain', 'and', 'balance', 'body fluids',
      'Plays', 'role', 'maintenance', 'high', 'of', 'interstitial fluid'
    ]),
    {
      labels: ['P', 'Q', 'R', 'S'],
      entries: [
        'Long extends cortex kidneys inner medulla',
        'Maintain potassium in blood',
        'Maintain and balance body fluids',
        'Plays role maintenance high of interstitial fluid'
      ]
    }
  );

  const reabsorption = {
    matchOptions: {
      A: 'A-Q, B-R, C-P',
      B: 'A-P, B-R, C-Q',
      C: 'A-R, B-Q, C-P',
      D: 'A-R, B-P, C-Q'
    }
  };
  assert.deepEqual(
    matchDisplay.reconstructEntries(reabsorption, 'left', [
      'Reabsorption', 'glucose, Na+', 'acids',
      'Reabsorption', 'nitrogenous wastes',
      'Reabsorption', 'water'
    ]).entries,
    [
      'Reabsorption glucose, Na+ acids',
      'Reabsorption nitrogenous wastes',
      'Reabsorption water'
    ]
  );
});

test('chemical formula fragments do not create false Biology statement starts', () => {
  const q = { matchOptions: { A: 'A-Q, B-S, C-P, D-R' } };
  assert.deepEqual(
    matchDisplay.reconstructEntries(q, 'right', [
      'Water', 'containing NaCl, urea',
      'Remove', 'amounts', 'CO2',
      'Eliminate sterols,', 'and', 'through sebum',
      'Secretes', 'and biliverdin'
    ]).entries,
    [
      'Water containing NaCl, urea',
      'Remove amounts CO2',
      'Eliminate sterols, and through sebum',
      'Secretes and biliverdin'
    ]
  );
});

test('valid rows are never rewritten', () => {
  const q = { matchOptions: { A: 'A-Q, B-S, C-P, D-R' } };
  const rows = ['Water containing NaCl, urea', 'Removes CO2', 'Eliminates sterols', 'Secretes bile pigments'];
  assert.deepEqual(matchDisplay.reconstructEntries(q, 'right', rows).entries, rows);
});

test('nested p q r rows plus an outer numbered continuation reconstruct as p q r s', () => {
  const question = {
    matchOptions: {
      A: 'p-iii, q-iv, r-i, s-ii',
      B: 'p-ii, q-iii, r-iv, s-i'
    }
  };
  assert.deepEqual(
    matchDisplay.reconstructEntries(question, 'left', [
      '(p) First limit (q) Second limit (r) Third limit',
      'Fourth limit'
    ]),
    {
      labels: ['p', 'q', 'r', 's'],
      entries: ['First limit', 'Second limit', 'Third limit', 'Fourth limit']
    }
  );
});
