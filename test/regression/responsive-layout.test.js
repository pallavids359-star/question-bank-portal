const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const bulkCss = fs.readFileSync(path.join(root, 'public/bulk-import.css'), 'utf8');

test('mobile navigation uses the real sidebar and main-content IDs', () => {
  assert.match(html, /@media \(max-width:820px\)[\s\S]*#sidebar\s*\{/);
  assert.match(html, /#mainContent\s*\{margin-left:0;/);
  assert.match(html, /id="mobileNavToggle"/);
  assert.match(html, /id="sidebarBackdrop"/);
});

test('mobile navigation is accessible and closes after navigation', () => {
  assert.match(html, /aria-controls="sidebar" aria-expanded="false"/);
  assert.match(html, /function showPage\(id\)\s*\{\s*closeMobileSidebar\(\);/);
  assert.match(html, /event\.key === 'Escape'/);
});

test('saved questions, forms, tables and modals have responsive rules', () => {
  assert.match(html, /\.filters\{display:grid;grid-template-columns:repeat\(2/);
  assert.match(html, /\.li-top\{flex-direction:column;\}/);
  assert.match(html, /\.table-wrap table\{min-width:680px;\}/);
  assert.match(html, /\.modal\{padding:22px 18px;/);
});

test('bulk import stacks without changing its workflow', () => {
  assert.match(bulkCss, /@media\(max-width:820px\)/);
  assert.match(bulkCss, /\.bq-workspace,\.bq-workspace-grid\{display:flex!important;flex-direction:column!important/);
  assert.match(bulkCss, /\.bq-card-opts\{grid-template-columns:1fr;\}/);
});
