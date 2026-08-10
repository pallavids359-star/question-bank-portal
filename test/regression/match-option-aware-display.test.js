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

test('numeric and lowercase mappings retain their own label scheme', () => {
  const q = { matchOptions: { A: '1-d, 2-c, 3-b, 4-a' } };
  assert.deepEqual(matchDisplay.labelsFor(q, 'left', 4), ['1', '2', '3', '4']);
  assert.deepEqual(matchDisplay.labelsFor(q, 'right', 4), ['a', 'b', 'c', 'd']);
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
