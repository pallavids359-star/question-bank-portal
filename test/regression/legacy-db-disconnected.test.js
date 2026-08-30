'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('legacy Supabase compatibility client performs no legacy reads and blocks writes', async () => {
  const legacy = require('../../lib/supabase');

  const read = await legacy
    .from('questions')
    .select('id', { count: 'exact' })
    .eq('subject', 'Physics')
    .range(0, 9);

  assert.deepEqual(read.data, []);
  assert.equal(read.error, null);
  assert.equal(read.count, 0);

  const single = await legacy
    .from('questions')
    .select('*')
    .eq('id', 'legacy-id')
    .maybeSingle();

  assert.equal(single.data, null);
  assert.equal(single.error, null);

  const write = await legacy
    .from('questions')
    .insert({ question: 'must not reach old DB' })
    .select('*');

  assert.equal(write.data, null);
  assert.equal(write.error.code, 'LEGACY_DB_DISABLED');
});
