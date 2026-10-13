'use strict';
// Input: a LOCAL normalized JSONL export, not a live server or a raw arbitrary log format.
const fs = require('node:fs');
const readline = require('node:readline');
const { run, OpsError } = require('../../lib/ops');
const { trafficReport } = require('../../lib/traffic-report');
async function main(args = process.argv.slice(2)) {
  const [file, start, end] = args;
  if (!file || !start || !end) throw new OpsError('USAGE', '用法：traffic-report.js <local.jsonl> <start ISO> <end ISO>');
  const rows = [], input = fs.createReadStream(file);
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      if (rows.length >= 1000000 || line.length > 32768) throw new OpsError('REPORT_INPUT_LIMIT', '输入过大，请按时间拆分');
      try { rows.push(JSON.parse(line)); } catch { rows.push(null); }
    }
  } finally { lines.close(); input.destroy(); }
  return trafficReport(rows, { start, end });
}
if (require.main === module) run(main);
module.exports = main;
