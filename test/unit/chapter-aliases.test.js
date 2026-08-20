'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  chapterDisplayName,
  chapterStoredAliases,
} = require('../../lib/chapter-aliases');

const displayCases = [
  ['Physics', '11', 'Units and Measurement', 'Units and Measurements'],
  ['Physics', '12', 'Current Electricity (Metre Bridge, Practical Skills)', 'Current Electricity'],
  ['Physics', '12', 'Digital Electronics', 'Semiconductor Electronics: Materials, Devices and Simple Circuits'],
  ['Physics', '12', 'Digital Electronics (JEE Main 2024 Archive)', 'Semiconductor Electronics: Materials, Devices and Simple Circuits'],
  ['Physics', '12', 'Semiconductor Electronics', 'Semiconductor Electronics: Materials, Devices and Simple Circuits'],
  ['Physics', '12', 'Electrostatic Potential & Capacitance', 'Electrostatic Potential and Capacitance'],
  ['Physics', '12', 'Moving Coil Galvanometer', 'Moving Charges and Magnetism'],
  ['Chemistry', '11', 'Organic Chemistry: Some Basic Principles and Techniques', 'Organic Chemistry - Some Basic Principles and Techniques'],
  ['Chemistry', '11', 'Common Names of Organic Compounds', 'Organic Chemistry - Some Basic Principles and Techniques'],
  ['Chemistry', '11', 'Practical Chemistry', 'Organic Chemistry - Some Basic Principles and Techniques'],
  ['Chemistry', '11', 'Practical Inorganic Chemistry', 'Organic Chemistry - Some Basic Principles and Techniques'],
  ['Chemistry', '11', 'Practical Organic Chemistry', 'Organic Chemistry - Some Basic Principles and Techniques'],
  ['Chemistry', '11', 'Practical Physical Chemistry', 'Organic Chemistry - Some Basic Principles and Techniques'],
  ['Chemistry', '11', 'Chemical Thermodynamics', 'Thermodynamics'],
  ['Chemistry', '11', 'Spontaneity', 'Thermodynamics'],
  ['Chemistry', '11', 'Thermodynamics & Thermochemistry', 'Thermodynamics'],
  ['Chemistry', '11', 'Bond Parameters', 'Chemical Bonding and Molecular Structure'],
  ['Chemistry', '11', 'lonic or Electrovalent Bond', 'Chemical Bonding and Molecular Structure'],
  ['Chemistry', '11', 'Kossel-Lewis Approach to Chemical Bonding', 'Chemical Bonding and Molecular Structure'],
  ['Chemistry', '11', 'DE BROGLIE CONCEPT PRINCIPLE AND HEISENBERG UNCERTAINTY PRINCIPLE', 'Structure of Atom'],
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
  ['Chemistry', '12', 'The d and f-Block Elements', 'The d- and f- block Elements'],
  ['Chemistry', '12', 'Alcohols Phenols and Ethers', 'Alcohols, Phenols and Ethers'],
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
    chapterStoredAliases('Chemistry', '11', 'Thermodynamics'),
    [
      'Thermodynamics',
      'Chemical Thermodynamics',
      'Spontaneity',
      'Thermodynamics & Thermochemistry',
      'Thermodynamics and Thermochemistry',
    ]
  );
  assert.deepEqual(
    chapterStoredAliases('Mathematics', '11', 'Trigonometric'),
    ['Trigonometric']
  );
});
