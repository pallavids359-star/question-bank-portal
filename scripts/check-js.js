'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const roots = ['api', 'lib', 'middleware', 'routes', 'scripts'];
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name.endsWith('.js') && target !== __filename) files.push(target);
  }
}
for (const root of roots) if (fs.existsSync(root)) walk(root);
files.push('server.js');
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`Syntax checked ${files.length} JavaScript files.`);
