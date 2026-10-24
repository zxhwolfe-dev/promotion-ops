'use strict';
const path = require('node:path');
const { withBrowser } = require('../../lib/cdp');
const { run } = require('../../lib/ops');
const { checkRunDate, downloadPackage } = require('../../lib/ak-native-download');
function options(args) {
  let date, baseDir, allowHistorical = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date') date = args[++i];
    else if (args[i] === '--base-dir') baseDir = args[++i];
    else if (args[i] === '--allow-historical') allowHistorical = true;
    else throw new Error('Usage: download-ak-native.js --date YYYY-MM-DD --base-dir <absolute daily folder> [--allow-historical]');
  }
  if (!baseDir || !path.isAbsolute(baseDir)) throw new Error('An absolute base directory is required');
  checkRunDate(date); // Must fail before loading credentials or connecting to authenticated Chrome.
  return { date, baseDir: path.resolve(baseDir), allowHistorical };
}
async function main(args = process.argv.slice(2)) {
  const config = options(args);
  return withBrowser(context => downloadPackage(context, config));
}
if (require.main === module) run(main);
module.exports = { main, options };
