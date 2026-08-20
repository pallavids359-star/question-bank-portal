'use strict';

const CHAPTER_ALIAS_GROUPS = {
  'Chemistry-11': [
    {
      canonical: 'Organic Chemistry - Some Basic Principles and Techniques',
      aliases: [
        'Organic Chemistry - Some Basic Principles and Techniques',
        'Organic Chemistry – Some Basic Principles and Techniques',
        'Organic Chemistry: Some Basic Principles and Techniques',
      ],
    },
    {
      canonical: 'Chemical Thermodynamics',
      aliases: [
        'Chemical Thermodynamics',
        'Thermodynamics',
        'Thermodynamics & Thermochemistry',
        'Thermodynamics and Thermochemistry',
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
      ],
    },
    {
      canonical: 'Application of Derivatives',
      aliases: [
        'Application of Derivatives',
        'Application of Derivative',
        'Applications of Derivatives',
      ],
    },
  ],
  'Physics-12': [
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
    {
      canonical: 'Moving Charges and Magnetism',
      aliases: [
        'Moving Charges and Magnetism',
        'Moving Charges & Magnetism',
        'Magnetic Effects of Current',
        'Magnetic Force and Motion of Charge',
      ],
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
      ],
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
