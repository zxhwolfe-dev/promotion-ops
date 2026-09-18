#!/usr/bin/env node
'use strict';
const { run, requiredEnv, readText } = require('../../lib/ops');
const { writeOnce } = require('../../lib/state');
const { prepareURLs, pushURLs } = require('../../lib/baidu');
async function main(args = process.argv.slice(2)) {
  const token = requiredEnv('BAIDU_PUSH_TOKEN');
  const prepared = prepareURLs(await readText(args[0]), process.env.BAIDU_SITE || 'https://aiworkstation.cn');
  return writeOnce({ kind: 'baidu.push', site: prepared.site, urls: [...prepared.urls].sort() }, async ({ submit }) => {
    const result = await submit(() => pushURLs({ ...prepared, token }));
    return { status: 'verified', ...result, evidence: { kind: 'api_acceptance', requested: prepared.urls.length, indexed: 'not_verified' } };
  });
}
if (require.main === module) run(main);
module.exports = main;
