'use strict';
// node scripts/gmail/compose-send.js <to> <subject> <bodyFile>
const { withPage, withReadPage } = require('../../lib/cdp');
const { run, requiredEnv, readText, navigate, choose, button, fillEmpty, until, OpsError } = require('../../lib/ops');
const { writeOnce } = require('../../lib/state');
const { validateTitle } = require('../../lib/articles');
const { mailboxBase, email, assertAccount, searchMailbox, verifySent } = require('../../lib/gmail');
async function main(args = process.argv.slice(2)) {
  const recipient = email(args[0]);
  const subject = validateTitle(args[1]);
  const body = await readText(args[2]);
  const account = email(requiredEnv('GMAIL_EXPECTED_EMAIL'));
  const query = `in:sent to:${recipient} newer_than:1d`;
  return writeOnce({ kind: 'gmail.send', account, recipient, subject, body }, ({ submit }) => withPage(async page => {
    const before = await searchMailbox(page, query);
    await assertAccount(page, account);
    if (!before.complete || before.rows.some(row => !row.id)) throw new OpsError('SENT_BASELINE_UNVERIFIED', '发送前的已发送基线不完整，需人工缩小检索范围后再发送');
    const previousIds = new Set(before.rows.map(row => row.id));
    await navigate(page, mailboxBase() + '#inbox?compose=new', ['mail.google.com']);
    const composer = await choose(page, [page.getByRole('dialog').filter({ has: page.locator('input[name="subjectbox"]') })], '唯一的新邮件撰写窗口');
    const to = await choose(page, [composer.locator('input[aria-label="发送至收件人"], input[aria-label="To recipients"], textarea[name="to"]')], '收件人输入框');
    await fillEmpty(to, recipient); await to.press('Tab');
    await fillEmpty(await choose(page, [composer.locator('input[name="subjectbox"]')], '邮件主题'), subject);
    await fillEmpty(await choose(page, [composer.locator('[aria-label="邮件正文"], [aria-label="Message Body"]')], '邮件正文'), body);
    const send = await button(page, /^(?:发送|Send)(?:\s*[（(].*[）)])?$/, composer);
    await assertAccount(page, account); // Recheck immediately before the external side effect.
    await submit(() => send.click()); // 不使用可能弹出确认框的 Ctrl+Enter。
    return withReadPage(page.context(), readPage => until(() => verifySent(readPage, { query, previousIds, recipient, subject, body, account }), {
      timeout: 30000, interval: 2000, label: '未在已发送中独立核验到新邮件；禁止重发，同主题会话合并可能需要人工核验',
    }));
  }, { keepOnError: true }));
}
if (require.main === module) run(main);
module.exports = main;
