'use strict';
const { withPage } = require('../../lib/cdp');
const { run, requiredEnv, OpsError } = require('../../lib/ops');
const { searchMailbox, assertAccount, email } = require('../../lib/gmail');

function sweepQuery(value = 'in:anywhere') {
  // Only time boundaries may narrow a sweep; unread/keyword filters hide important mail.
  if (typeof value !== 'string' || !/^in:anywhere(?: (?:after|before):(?:\d{4}\/\d{2}\/\d{2}|\d{10})| (?:newer_than|older_than):[1-9]\d*[dmy])*$/.test(value)) {
    throw new OpsError('INVALID_SWEEP_QUERY', '全量检查须用 in:anywhere，可加日期边界，不允许关键词或未读筛选');
  }
  return value;
}
async function main() {
  const query = sweepQuery(process.env.GMAIL_SWEEP_QUERY);
  const account = email(requiredEnv('GMAIL_EXPECTED_EMAIL'));
  const startedAt = new Date().toISOString();
  return withPage(async page => {
    const result = await searchMailbox(page, query, 500, { maxPages: 50, account });
    await assertAccount(page, account);
    return { ...result, startedAt, finishedAt: new Date().toISOString(),
      includesSpamAndTrash: true, timeWindow: query, bodyReview: 'not_performed',
      followup: result.complete ? '逐项检查摘要并打开重要邮件正文；本结果不代表正文已读' : '按日期拆分范围继续检查，覆盖完整前不能称全量完成' };
  });
}
if (require.main === module) run(main);
module.exports = main;
module.exports.sweepQuery = sweepQuery;
