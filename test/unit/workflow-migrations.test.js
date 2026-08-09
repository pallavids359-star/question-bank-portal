'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = name => fs.readFileSync(path.join(root, 'migrations', name), 'utf8');

test('migration accepts only active and exact safe-rollback markers', () => {
  const sql = read('02_workflow_migration.sql');
  assert.match(sql, /not in \('QBP_WORKFLOW_V1','QBP_WORKFLOW_V1_DISABLED'\)/);
  assert.match(sql, /revoke all on function[\s\S]*from public,anon,authenticated/);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/);
});

test('safe rollback preserves objects and disables only execution', () => {
  const executable = read('04_workflow_safe_rollback.sql')
    .split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
  assert.match(executable, /QBP_WORKFLOW_V1_DISABLED/);
  assert.doesNotMatch(executable, /QBP_WORKFLOW_V1_DISABLED:/);
  assert.match(executable, /revoke execute/);
  assert.doesNotMatch(executable, /\bdrop\b|\btruncate\b|delete\s+from/i);
});

test('preflight treats login_history as optional', () => {
  const sql = read('01_workflow_preflight.sql');
  assert.match(sql, /to_regclass\('public\.login_history'\)/);
  assert.doesNotMatch(sql, /union all select 'login_history',count\(\*\) from public\.login_history/);
});

test('behavior verification requires psql UUID variables and rolls back', () => {
  const sql = read('03_workflow_verification.sql');
  for (const name of ['admin_id','editor_same_id','editor_other_id','viewer_id','question_id']) {
    assert.match(sql, new RegExp(`:\\{\\?${name}\\}`));
    assert.match(sql, new RegExp(`:'${name}'::uuid`));
  }
  assert.match(sql, /begin;[\s\S]*rollback;/i);
});

test('failure verification covers all atomic inserts with rollback', () => {
  const sql = read('06_workflow_failure_verification.sql');
  for (const table of ['question_history','notifications','audit_log']) {
    assert.match(sql, new RegExp(`before insert on public\\.${table}`));
  }
  assert.equal((sql.match(/rollback;/gi) || []).length, 3);
});
