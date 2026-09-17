'use strict';
const { run, OpsError } = require('../../lib/ops');
const { inspectState } = require('../../lib/inspection');
async function main(args = process.argv.slice(2)) {
  let all = false, limit = 100;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') all = true;
    else if (args[i] === '--limit' && /^\d+$/.test(args[i + 1] || '')) limit = Number(args[++i]);
    else throw new OpsError('USAGE', '用法：inspect-state.js [--all] [--limit 1..1000]；此命令只读');
  }
  return inspectState({ all, limit });
}
if (require.main === module) run(main);
module.exports = main;
