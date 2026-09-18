'use strict';
const { withPage } = require('../../lib/cdp');
const { run } = require('../../lib/ops');
const { searchMailbox } = require('../../lib/gmail');
// 含垃圾箱/垃圾邮件的时间窗检查，不再把前 15 封收件箱邮件叫“全量”。
async function main() {
  const query = process.env.GMAIL_SWEEP_QUERY || 'in:anywhere newer_than:7d';
  return withPage(page => searchMailbox(page, query, 50));
}
if (require.main === module) run(main);
module.exports = main;
