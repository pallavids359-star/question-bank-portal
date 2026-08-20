'use strict';

const CHAPTER_ALIAS_GROUPS = {
  'Physics-11': [
    {
      canonical: 'Units and Measurements',
      aliases: ['Units and Measurements', 'Units and Measurement'],
    },
  ],
  'Physics-12': [
    {
      canonical: 'Current Electricity',
      aliases: [
        'Current Electricity',
        'Current electricity',
        'Current Electricity (Metre Bridge, Practical Skills)',
      ],
    },
    {
      canonical: 'Semiconductor Electronics: Materials, Devices and Simple Circuits',
      aliases: [
        'Semiconductor Electronics: Materials, Devices and Simple Circuits',
        'Digital Electronics',
        'Digital Electronics (JEE Main 2024 Archive)',
        'Semiconductor electronics',
        'Semiconductor Electronics',
        'SEMICONDUCTOR ELECTRONICS',
        'Semiconductor Electronics (',
      ],
    },
    {
      canonical: 'Electrostatic Potential and Capacitance',
      aliases: [
        'Electrostatic Potential and Capacitance',
        'Electrostatic Potential & Capacitance',
      ],
    },
    {
      canonical: 'Moving Charges and Magnetism',
      aliases: [
        'Moving Charges and Magnetism',
        'Moving Charges & Magnetism',
        'Magnetic Effects of Current',
        'Magnetic Force and Motion of Charge',
        'Moving Coil Galvanometer',
      ],
    },
    {
      canonical: 'Ray Optics And Optical Instruments',
      aliases: [
        'Ray Optics And Optical Instruments',
        'Ray Optics and Optical Instruments',
        'Geometric Optics',
        'Ray Optics',
        'Geometric Optics/Ray Optics',
      ],
    },
    {
      canonical: 'Magnetism and Matter',
      aliases: ['Magnetism and Matter', 'Magnetism and Mater', 'MAGNETISM AND MATTER'],
    },
  ],
  'Chemistry-11': [
    {
      canonical: 'Organic Chemistry - Some Basic Principles and Techniques',
      aliases: [
        'Organic Chemistry - Some Basic Principles and Techniques',
        'Organic Chemistry – Some Basic Principles and Techniques',
        'Organic Chemistry: Some Basic Principles and Techniques',
        'Common Names of Organic Compounds',
        'Practical Chemistry',
        'Practical Inorganic Chemistry',
        'Practical Organic Chemistry',
        'Practical Physical Chemistry',
      ],
    },
    {
      canonical: 'Thermodynamics',
      aliases: [
        'Thermodynamics',
        'Chemical Thermodynamics',
        'Spontaneity',
        'Thermodynamics & Thermochemistry',
        'Thermodynamics and Thermochemistry',
      ],
    },
    {
      canonical: 'Chemical Bonding and Molecular Structure',
      aliases: [
        'Chemical Bonding and Molecular Structure',
        'Bond Parameters',
        'lonic or Electrovalent Bond',
        'Ionic or Electrovalent Bond',
        'Kossel-Lewis Approach to Chemical Bonding',
      ],
    },
    {
      canonical: 'Structure of Atom',
      aliases: [
        'Structure of Atom',
        'DE BROGLIE CONCEPT PRINCIPLE AND HEISENBERG UNCERTAINTY PRINCIPLE',
      ],
    },
  ],
  'Mathematics-11': [
    {
      canonical: 'Trigonometric Functions',
      aliases: ['Trigonometric Functions', 'Trigonometric Ratios'],
    },
  ],
  'Mathematics-12': [
    {
      canonical: 'Three Dimensional Geometry',
      aliases: [
        'Three Dimensional Geometry',
        'Three-dimensional Geometry',
        'Three dimensional Geometry',
        '3D Geometry',
        '3D Geomerty',
      ],
    },
    {
      canonical: 'Application of Derivatives',
      aliases: [
        'Application of Derivatives',
        'Application of Derivative',
        'Applications of Derivatives',
        'Algebra of Derivatives',
        'Derivative as Rate Measure',
        'Geometrical Interpretation of a Derivative',
      ],
    },
    {
      canonical: 'Application of Integrals',
      aliases: ['Application of Integrals', 'Applications of Integrals', 'area'],
    },
    {
      canonical: 'Integrals',
      aliases: [
        'Integrals',
        'Definite Integration',
        'Fundamental Theorem of Definite Integration',
        'Definite Integration of Odd-Even and Periodic Functions',
      ],
    },
    {
      canonical: 'Continuity and Differentiability',
      aliases: [
        'Continuity and Differentiability',
        'Exponential and Logarithmic Functions',
      ],
    },
    {
      canonical: 'Vector Algebra',
      aliases: ['Vector Algebra', 'Vectors'],
    },
  ],
  'Biology-12': [
    {
      canonical: 'Human Health and Disease',
      aliases: ['Human Health and Disease', 'Human Health and Diseases'],
    },
  ],
  'Chemistry-12': [
    {
      canonical: 'The d- and f- block Elements',
      aliases: [
        'The d- and f- block Elements',
        'The d- and f-block Elements',
        'd and f block Elements',
        'The d and f-Block Elements',
      ],
    },
    {
      canonical: 'Alcohols, Phenols and Ethers',
      aliases: ['Alcohols, Phenols and Ethers', 'Alcohols Phenols and Ethers'],
    },
  ],
};

function aliasKey(subject, klass) {
  const canonicalSubject = String(subject || '').trim() === 'Maths'
    ? 'Mathematics'
    : String(subject || '').trim();
  const canonicalClass = String(klass || '').replace(/^class\s*/i, '').trim();
  return `${canonicalSubject}-${canonicalClass}`;
}

function matchingGroup(subject, klass, chapter) {
  const storedName = String(chapter || '').trim();
  if (!storedName) return null;
  const normalized = storedName.toLowerCase();
  return (CHAPTER_ALIAS_GROUPS[aliasKey(subject, klass)] || []).find(group =>
    group.aliases.some(alias => alias.toLowerCase() === normalized)
  ) || null;
}

function chapterDisplayName(subject, klass, chapter) {
  const storedName = String(chapter || '').trim();
  const group = matchingGroup(subject, klass, storedName);
  return group ? group.canonical : storedName;
}

function chapterStoredAliases(subject, klass, chapter) {
  const group = matchingGroup(subject, klass, chapter);
  return group ? group.aliases.slice() : [String(chapter || '').trim()].filter(Boolean);
}

module.exports = {
  CHAPTER_ALIAS_GROUPS,
  chapterDisplayName,
  chapterStoredAliases,
};
