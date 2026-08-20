'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  chapterDisplayName,
  chapterStoredAliases,
} = require('../../lib/chapter-aliases');

const displayCases = [
  ['Chemistry', '11', 'Organic Chemistry: Some Basic Principles and Techniques', 'Organic Chemistry - Some Basic Principles and Techniques'],
  ['Chemistry', '11', 'Thermodynamics', 'Chemical Thermodynamics'],
  ['Chemistry', '11', 'Thermodynamics & Thermochemistry', 'Chemical Thermodynamics'],
  ['Chemistry', '11', 'Thermodynamics and Thermochemistry', 'Chemical Thermodynamics'],
  ['Mathematics', '11', 'Trigonometric Ratios', 'Trigonometric Functions'],
  ['Maths', '12', '3D Geometry', 'Three Dimensional Geometry'],
  ['Mathematics', '12', 'Application of Derivative', 'Application of Derivatives'],
  ['Physics', '12', 'Geometric Optics', 'Ray Optics And Optical Instruments'],
  ['Physics', '12', 'Ray Optics', 'Ray Optics And Optical Instruments'],
  ['Physics', '12', 'Magnetism and Mater', 'Magnetism and Matter'],
  ['Physics', '12', 'MAGNETISM AND MATTER', 'Magnetism and Matter'],
  ['Physics', '12', 'Moving Charges & Magnetism', 'Moving Charges and Magnetism'],
  ['Biology', '12', 'Human Health and Diseases', 'Human Health and Disease'],
  ['Chemistry', '12', 'd and f block Elements', 'The d- and f- block Elements'],
];

displayCases.forEach(([subject, klass, stored, canonical]) => {
  test(`${subject} Class ${klass}: ${stored} displays as ${canonical}`, () => {
    assert.equal(chapterDisplayName(subject, klass, stored), canonical);
  });
});

test('aliases are scoped by subject and class', () => {
  assert.equal(chapterDisplayName('Physics', '11', 'Thermodynamics'), 'Thermodynamics');
  assert.equal(chapterDisplayName('Mathematics', '12', 'Trigonometric Ratios'), 'Trigonometric Ratios');
  assert.equal(chapterDisplayName('Biology', '11', 'Human Health and Diseases'), 'Human Health and Diseases');
});

test('canonical filters expand to every explicit stored alias without fuzzy matching', () => {
  assert.deepEqual(
    chapterStoredAliases('Chemistry', '11', 'Chemical Thermodynamics'),
    [
      'Chemical Thermodynamics',
      'Thermodynamics',
      'Thermodynamics & Thermochemistry',
      'Thermodynamics and Thermochemistry',
    ]
  );
  assert.deepEqual(
    chapterStoredAliases('Mathematics', '11', 'Trigonometric'),
    ['Trigonometric']
  );
});
