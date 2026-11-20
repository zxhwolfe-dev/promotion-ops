'use strict';

const fs = require('node:fs/promises');
const { validateReviewConfig } = require('../../lib/editorial-process');
const { reviewContent } = require('../../lib/editorial-review');

async function main(args = process.argv.slice(2)) {
  let configFile, manifestFile;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config') configFile = args[++i];
    else if (args[i] === '--manifest') manifestFile = args[++i];
    else throw Error('Usage: --config private.json --manifest content-review.json');
  }
  if (!configFile || !manifestFile) throw Error('Config and content manifest required');
  if (process.env.PROMO_REVIEW_ONLY === '1') throw Error('Reviewer cannot start another reviewer');
  const c = validateReviewConfig(JSON.parse(await fs.readFile(configFile, 'utf8')));
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  return reviewContent({ c, manifest });
}

if (require.main === module) {
  main().then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.decision === 'approve' ? 0 : 2;
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main };
