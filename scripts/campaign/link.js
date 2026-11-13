'use strict';
const { run, OpsError } = require('../../lib/ops');
const { campaignURL } = require('../../lib/campaign');
async function main(args = process.argv.slice(2)) {
  if (args.length < 5 || args.length > 7) throw new OpsError('USAGE', '用法：node scripts/campaign/link.js <zh|en> <channel> </path/> <campaign> <content> [medium] [aiworkstation|ak]');
  const [language, channel, path, campaign, content, medium, product] = args;
  return { status: 'ok', url: campaignURL({ language, channel, path, campaign, content, medium, product }) };
}
if (require.main === module) run(main);
module.exports = main;
