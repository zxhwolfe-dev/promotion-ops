'use strict';
const { OpsError, navigate, choose, until, normalize, assertNoChallenge } = require('./ops');
const { collectMailboxPages } = require('./gmail-pagination');
function mailboxBase() {
  const index = process.env.GMAIL_ACCOUNT_INDEX || '0';
  if (!/^\d{1,2}$/.test(index)) throw new OpsError('INVALID_ACCOUNT_INDEX', 'GMAIL_ACCOUNT_INDEX 必须是 0–99');
  return `https://mail.google.com/mail/u/${index}/`;
}
function email(value) {
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value || '')) throw new OpsError('INVALID_EMAIL', '请提供单个有效邮箱地址，不支持地址列表或邮件头注入');
  return value.toLowerCase();
}
async function assertAccount(page, expected) {
  const labels = await page.locator('a[href*="accounts.google.com/SignOutOptions"], button[data-ogsr-up]').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label') || ''));
  const accounts = labels.flatMap(label => label.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []);
  const identities = new Set(accounts.map(account => account.toLowerCase()));
  if (identities.size !== 1 || !identities.has(expected.toLowerCase())) throw new OpsError('ACCOUNT_UNVERIFIED', '无法核验 Gmail 当前账号，禁止发送；请检查 GMAIL_EXPECTED_EMAIL 和账号头像', 3);
}
function queryFromHash(hash) {
  try { return hash.startsWith('#search/') ? decodeURIComponent(hash.slice(8).replace(/\/p[1-9]\d*$/, '').replace(/\+/g, ' ')).trim() : ''; } catch { return ''; }
  // 真实 Gmail 会把查询中的空格规范为 '+' 写进 hash（decodeURIComponent 不还原），
  // 且搜索框回读值可能带尾随空格；两端都规范化后才允许判定“同一次搜索”。
}
async function searchMailbox(page, query, limit = 50, options = {}) {
  if (typeof query !== 'string' || !query.trim() || query.length > 2000 || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new OpsError('INVALID_SEARCH', '搜索词须非空，limit 须为 1–500 的整数');
  }
  const url = mailboxBase() + '#search/' + encodeURIComponent(query);
  if (page.url() === url) await page.reload({ waitUntil: 'domcontentloaded', timeout: 35000 });
  else await navigate(page, url, ['mail.google.com']);
  const box = await choose(page, [page.locator('input[name="q"]')], 'Gmail 搜索框', 30000);
  if (queryFromHash(new URL(page.url()).hash) !== query.trim() || (await box.inputValue()).trim() !== query.trim()) {
    await box.fill(query); // 不在旧查询后追加。
    await box.press('Enter');
  }
  // 冷启动的专用 Chrome 首次加载 Gmail 应用壳可能远慢于普通导航：先等主容器挂载，
  // 再等搜索完成信号。判定标准不变（必须有行或显式空结果），只放宽等待预算。
  await until(async () => (await page.locator('div[role="main"], .nH.Ak, table.F').count()) > 0,
    { timeout: 45000, code: 'GMAIL_APP_NOT_LOADED', exitCode: 2, label: 'Gmail 应用容器未挂载（冷启动加载过慢或会话异常）' });
  await until(async () => {
    await assertNoChallenge(page);
    // 同一性由 hash 承担；真实 Gmail 提交后可能异步清空/回填搜索框（值短暂为空），
    // 因此输入框只在“包含另一个查询”时才否决，空值不阻塞完成判定。
    if (queryFromHash(new URL(page.url()).hash) !== query.trim()) return false;
    const typed = (await box.inputValue()).trim();
    if (typed && typed !== query.trim()) return false;
    return (await page.locator('tr.zA:visible').count()) > 0 ||
      (await page.getByText(/没有任何.*(?:邮件|会话)|未找到.*(?:邮件|会话)|No conversations found|No messages matched/i).filter({ visible: true }).count()) > 0;
  }, { timeout: 45000, code: 'SEARCH_UNVERIFIED', exitCode: 2, label: '无法确认搜索已完成；不能把加载失败当成空收件箱' });
  if (options.account) await assertAccount(page, options.account);
  const maxPages = options.maxPages ?? 10;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 50) throw new OpsError('INVALID_SEARCH', 'maxPages 须为 1–50');
  const result = await collectMailboxPages(page, () => queryFromHash(new URL(page.url()).hash) === query.trim(), limit,
    { maxPages, pageTimeout: options.pageTimeout });
  return { ...result, query };

}
function sentDOMProof({ recipient, subject, body }) {
    const norm = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
    const title = [...document.querySelectorAll('h2.hP')].some(node => norm(node.innerText) === norm(subject));
    // 收件人和正文必须来自同一封邮件，不能跨会话消息拼接证据。
    const message = [...document.querySelectorAll('.adn')].some(node =>
      [...node.querySelectorAll('.g2[email]')].some(to => to.getAttribute('email').toLowerCase() === recipient) &&
      [...node.querySelectorAll('.a3s')].some(content => norm(content.innerText) === norm(body)));
    return title && message;
  }
async function openThreadById(page, threadId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(threadId)) return false;
  await navigate(page, mailboxBase() + '#all/' + encodeURIComponent(threadId), ['mail.google.com']);
  return true;
}

async function verifySent(page, { query, previousIds, recipient, subject, body, account }) {
  const result = await searchMailbox(page, query);
  if (account) await assertAccount(page, account);
  if (!result.complete) return null;
  const candidates = result.rows.filter(row => row.id && !previousIds.has(row.id) && normalize(row.subject) === normalize(subject));
  if (candidates.length !== 1) {
    // Matching an old message in a merged baseline thread cannot prove this send.
    // Until message-level baseline IDs are available, keep the outcome unverified.
    return null;
  }
  if (!(await openThreadById(page, candidates[0].id))) throw new OpsError('SENT_ID_AMBIGUOUS', '无法唯一定位已发送会话 ID', 2);
  const proof = await until(async () => page.evaluate(sentDOMProof, { recipient, subject, body }), { timeout: 8000, label: '已发送会话正文或收件人无法核验' });
  return proof ? { status: 'verified', evidence: { kind: 'independent_sent_mail_readback', threadId: candidates[0].id, recipientMatched: true, subjectMatched: true, bodyMatched: true, delivery: 'in_sent_not_recipient_delivery' } } : null;
}
module.exports = { mailboxBase, email, assertAccount, queryFromHash, searchMailbox, sentDOMProof, verifySent };
