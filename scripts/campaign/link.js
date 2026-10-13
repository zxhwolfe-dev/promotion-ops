'use strict';
const { run, OpsError } = require('../../lib/ops');
const { campaignURL } = require('../../lib/campaign');
async function main(args = process.argv.slice(2)) {
  if (args.length < 5 || args.length > 6) throw new OpsError('USAGE', '用法：node scripts/campaign/link.js <zh|en> <channel> </path/> <campaign> <content> [medium]');
  const [language, channel, path, campaign, content, medium] = args;
  return { status: 'ok', url: campaignURL({ language, channel, path, campaign, content, medium }) };
}
if (require.main === module) run(main);
module.exports = main;
