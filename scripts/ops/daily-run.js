'use strict';
const fs = require('node:fs/promises');
const { dailyRun } = require('../../lib/daily-runner');

async function main(args = process.argv.slice(2)) {
  let configFile;
  let mode = 'plan';
  let asOf = new Date().toISOString();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config') configFile = args[++i];
    else if (args[i] === '--mode') mode = args[++i];
    else if (args[i] === '--as-of') asOf = args[++i];
    else throw Error('Usage: --config file --mode plan|build --as-of ISO');
  }
  if (!configFile) throw Error('Local config required');
  if (!['plan', 'build'].includes(mode)) throw Error('Choose plan or build. Use publish-video.js for a specific approved job.');
  return dailyRun({ config: JSON.parse(await fs.readFile(configFile, 'utf8')), mode, asOf });
}

if (require.main === module) {
  main().then(result => {
    const { date, status, results, skipped, failures, needsHuman } = result;
    console.log(JSON.stringify({ date, status, results, skipped, failures, needsHuman }, null, 2));
    process.exitCode = status === 'blocked' ? 2 : 0;
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { main };
