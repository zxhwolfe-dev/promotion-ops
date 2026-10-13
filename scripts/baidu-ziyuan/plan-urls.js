'use strict';
const { run, readText } = require('../../lib/ops');
const { planPush } = require('../../lib/baidu-plan');
async function main(args = process.argv.slice(2)) { return planPush(JSON.parse(await readText(args[0]))); }
if (require.main === module) run(main);
module.exports = main;
