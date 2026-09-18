'use strict';
const { withPage } = require('../../lib/cdp');
const { run, OpsError } = require('../../lib/ops');
const { searchMailbox } = require('../../lib/gmail');
async function main(args = process.argv.slice(2)) {
  if (!args[0]?.trim()) throw new OpsError('INPUT_REQUIRED', 'usage: node scripts/gmail/search.js <query>');
  return withPage(page => searchMailbox(page, args[0]));
}
if (require.main === module) run(main);
module.exports = main;
