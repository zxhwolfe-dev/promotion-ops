'use strict';
const fs = require('node:fs');
const { reserveAKPackage } = require('../../lib/ak-package-reservation');

async function main(args = process.argv.slice(2)) {
  if (args.length !== 2) throw new Error('Usage: reserve-ak-package.js <local-package.json> <local-media-registry.json>');
  const info = fs.statSync(args[0]);
  if (!info.isFile() || info.size > 4 * 1024 * 1024) throw new Error('Expected bounded local package JSON');
  return reserveAKPackage(JSON.parse(fs.readFileSync(args[0], 'utf8')), args[1]);
}
if (require.main === module) {
  main().then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.errors.length ? 2 : 0;
  }).catch(error => { console.error(`reserve-ak-package: ${error.message}`); process.exitCode = 1; });
}
module.exports = { main };
