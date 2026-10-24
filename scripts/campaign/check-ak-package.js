'use strict';
const fs = require('node:fs');
const { checkAKPackage } = require('../../lib/ak-package-check');
function main(args = process.argv.slice(2)) {
  if (args.length !== 1) throw new Error('Usage: check-ak-package.js <local-package-check-input.json>');
  const info = fs.statSync(args[0]);
  if (!info.isFile() || info.size > 4 * 1024 * 1024) throw new Error('Expected a local JSON file below 4 MiB');
  return checkAKPackage(JSON.parse(fs.readFileSync(args[0], 'utf8')));
}
if (require.main === module) {
  try { const result = main(); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.errors.length ? 2 : 0; }
  catch (error) { console.error(`check-ak-package: ${error.message}`); process.exitCode = 1; }
}
module.exports = { main };
