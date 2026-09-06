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

const routes = fs.readFileSync(
  path.join(root, 'routes', 'questions.js'),
  'utf8'
);

test('Saved Questions filters cache recent facet combinations in the browser', () => {
  assert.match(
    frontend,
    /QUESTION_FACET_CLIENT_CACHE_TTL_MS=60\*1000/
  );
  assert.match(
    frontend,
    /const questionFacetResponseCache=new Map\(\)/
  );
  assert.match(
    frontend,
    /rememberQuestionFacets\(cacheKey,nextFacets\)/
  );
  assert.match(
    frontend,
    /if\(requestSequence!==questionFacetRequestSequence\)return false/
  );
});

test('stale dependent dropdown options are hidden immediately', () => {
  assert.match(frontend, /clearStaleSavedFilterOptions/);
  assert.match(frontend, /Loading chapters\.\.\./);
  assert.match(frontend, /Loading concepts\.\.\./);
  assert.match(frontend, /Loading adders \/ admins\.\.\./);
  assert.match(
    frontend,
    /document\.addEventListener\('change',event=>[\s\S]*?,true\);/
  );
});

test('facet reads use the same subject/class shards as Saved Questions', () => {
  assert.match(
    routes,
    /questionReadSourcesFor\(subject,klass\)/
  );
  assert.match(
    routes,
    /const allRows = await readFacetRows\(subject, klass\);/
  );
  assert.match(routes, /const facetCache = new Map\(\);/);
  assert.match(routes, /const facetCacheLoads = new Map\(\);/);
});

test('facet metadata pages load concurrently with a bounded concurrency cap', () => {
  assert.match(routes, /const FACET_READ_CONCURRENCY = 6;/);
  assert.match(
    routes,
    /const firstPages=await Promise\.all\(/
  );
  assert.match(
    routes,
    /index\+=FACET_READ_CONCURRENCY/
  );
  assert.match(
    routes,
    /const batchRows=await Promise\.all\(/
  );
});

test('facet reads stay metadata-only', () => {
  const start = routes.indexOf(
    'async function firstFacetPage('
  );
  const end = routes.indexOf(
    'async function readFacetContributorUsers()',
    start
  );

  assert.ok(start >= 0 && end > start);

  const section = routes.slice(start, end);

  assert.match(
    section,
    /subject, klass, chapter, topic, q_type, created_by, created_by_name/
  );

  assert.doesNotMatch(section, /solution_text/);
  assert.doesNotMatch(section, /opt_a/);
  assert.doesNotMatch(section, /\.select\('\*'\)/);
});

test('contributor directory is cached instead of re-read on every filter click', () => {
  assert.match(
    routes,
    /FACET_CONTRIBUTOR_CACHE_TTL_MS = 60 \* 1000/
  );
  assert.match(
    routes,
    /async function readFacetContributorUsers\(\)/
  );
  assert.match(
    routes,
    /await readFacetContributorUsers\(\)/
  );
});