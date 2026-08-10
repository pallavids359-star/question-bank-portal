const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../../public/index.html'), 'utf8');

test('Admin and Editor both receive visible Easy Medium Hard controls', () => {
  assert.match(html, /if\(isEditor \|\| isAdmin\)\{\s*const difficultyGroup=/);
  assert.match(html, /\['Easy','Medium','Hard'\]\.forEach/);
  assert.doesNotMatch(html, /difficultyBtn\.textContent='Difficulty'/);
});
