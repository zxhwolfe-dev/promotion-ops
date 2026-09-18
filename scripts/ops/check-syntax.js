'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : entry.name.endsWith('.js') ? [file] : [];
  });
}
const root = path.resolve(__dirname, '../..');
const scripts = ['lib', 'scripts', 'tests'].flatMap(dir => files(path.join(root, dir)));
for (const file of scripts) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stderr); process.exitCode = 1; break; }
}
if (!process.exitCode) console.log(`Syntax OK: ${scripts.length} JavaScript files`);
