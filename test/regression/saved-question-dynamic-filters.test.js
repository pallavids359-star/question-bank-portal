'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const frontend = fs.readFileSync(
  path.join(root, 'public', 'index.html'),
  'utf8'
);
const questionRoutes = fs.readFileSync(
  path.join(root, 'routes', 'questions.js'),
  'utf8'
);

test('rapid Saved Questions filter changes cannot be overwritten by stale facet responses', () => {
  assert.match(frontend, /let questionFacetRequestSequence=0;/);
  assert.match(frontend, /const requestSequence=\+\+questionFacetRequestSequence;/);
  assert.match(
    frontend,
    /const createdBy=document\.getElementById\('fContributor'\)\?\.value\|\|'';/
  );
  assert.match(frontend, /if\(createdBy\)params\.set\('createdBy',createdBy\);/);
  assert.match(
    frontend,
    /if\(requestSequence!==questionFacetRequestSequence\)return false;/
  );
});

test('contributor selection and deselection refresh dependent dropdown facets', () => {
  assert.match(
    frontend,
    /savedFilterContributor\.addEventListener\('change',\(\)=>\{questionPage=1;loadQuestions\(1,true\);\}\)/
  );
});

test('facet endpoint keeps complete concept options for selected subject class and chapter', () => {
  assert.match(
    questionRoutes,
    /const createdBy = String\(req\.query\.createdBy \|\| ''\)\.trim\(\);/
  );

  assert.match(
    questionRoutes,
    /const matchesFacetRow = \(row, ignore = ''\) =>/
  );

  // Subject / class / chapter still participate in cascading facet logic.
  assert.match(
    questionRoutes,
    /matchesFacetRow\(row, 'subject'\)/
  );

  assert.match(
    questionRoutes,
    /matchesFacetRow\(row, 'klass'\)/
  );

  assert.match(
    questionRoutes,
    /matchesFacetRow\(row, 'chapter'\)/
  );

  // Concept options intentionally remain complete for the selected
  // Subject/Class/Chapter and are not narrowed by Question Type or contributor.
  const conceptStart = questionRoutes.indexOf(
    'const conceptRows = accessibleRows.filter(row => {'
  );

  const conceptEnd = questionRoutes.indexOf(
    'const contributorRows = accessibleRows.filter(',
    conceptStart
  );

  assert.ok(
    conceptStart >= 0 && conceptEnd > conceptStart,
    'Complete concept facet block should be present'
  );

  const conceptBlock = questionRoutes.slice(
    conceptStart,
    conceptEnd
  );

  assert.match(
    conceptBlock,
    /String\(row\.chapter \|\| ''\) !== chapter/
  );

  assert.doesNotMatch(
    conceptBlock,
    /requestedType/
  );

  assert.doesNotMatch(
    conceptBlock,
    /createdBy/
  );

  // Contributor filtering still remains independently supported.
  assert.match(
    questionRoutes,
    /matchesFacetRow\(row, 'createdBy'\)/
  );
});
test('facet loading remains metadata-only and keeps the scoped cached read path', () => {
  const start = questionRoutes.indexOf('async function firstFacetPage(');
  const end = questionRoutes.indexOf(
    'async function readFacetContributorUsers()',
    start
  );

  assert.ok(start >= 0 && end > start);

  const reader = questionRoutes.slice(start, end);

  assert.match(
    reader,
    /subject, klass, chapter, topic, q_type, created_by, created_by_name/
  );
  assert.doesNotMatch(reader, /\.select\('\*'\)/);
  assert.doesNotMatch(reader, /solution_text/);

  assert.match(
    questionRoutes,
    /async function readFacetRows\(subject='', klass=''\)/
  );
  assert.match(
    questionRoutes,
    /const cached=facetCache\.get\(cacheKey\);/
  );
  assert.match(
    questionRoutes,
    /cached && cached\.expiresAt>Date\.now\(\)/
  );
  assert.match(
    questionRoutes,
    /const facetCacheLoads = new Map\(\);/
  );
});