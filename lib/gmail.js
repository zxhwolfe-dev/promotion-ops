'use strict';
const { OpsError, navigate, choose, until, normalize } = require('./ops');
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
  const labels = await page.locator('a[href*="accounts.google.com/SignOutOptions"], button[data-ogsr-up]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label') || ''));
  const accounts = labels.flatMap(label => label.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []);
  if (!accounts.some(account => account.toLowerCase() === expected.toLowerCase())) throw new OpsError('ACCOUNT_UNVERIFIED', '无法核验 Gmail 当前账号，禁止发送；请检查 GMAIL_EXPECTED_EMAIL 和账号头像', 3);
}
function queryFromHash(hash) {
  try { return decodeURIComponent(hash.replace(/^#search\//, '')); } catch { return ''; }
}
async function searchMailbox(page, query, limit = 50) {
  const url = mailboxBase() + '#search/' + encodeURIComponent(query);
  if (page.url() === url) await page.reload({ waitUntil: 'domcontentloaded', timeout: 35000 });
  else await navigate(page, url, ['mail.google.com']);
  const box = await choose(page, [page.locator('input[name="q"]')], 'Gmail 搜索框');
  if (queryFromHash(new URL(page.url()).hash) !== query || (await box.inputValue()) !== query) {
    await box.fill(query); // 不在旧查询后追加。
    await box.press('Enter');
  }
  await until(async () => {
    if (queryFromHash(new URL(page.url()).hash) !== query || (await box.inputValue()) !== query) return false;
    return (await page.locator('tr.zA:visible').count()) > 0 ||
      (await page.getByText(/没有任何.*(?:邮件|会话)|未找到.*(?:邮件|会话)|No conversations found|No messages matched/i).filter({ visible: true }).count()) > 0;
  }, { code: 'SEARCH_UNVERIFIED', exitCode: 2, label: '无法确认搜索已完成；不能把加载失败当成空收件箱' });
  const rows = await page.locator('tr.zA:visible').evaluateAll((nodes, max) => nodes.slice(0, max).map(node => ({
    id: node.getAttribute('data-legacy-thread-id') || node.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id') || null,
    from: node.querySelector('.yP, .yW span')?.textContent?.trim() || '',
    subject: node.querySelector('.bog')?.textContent?.trim() || '',
    date: node.querySelector('.xW.xY span')?.getAttribute('title') || null,
  })), limit);
  const older = page.getByRole('button', { name: /^(?:Older|较旧|更早|下一页)$/i }).filter({ visible: true });
  const atEnd = (await older.count()) === 1 && await older.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.disabled === true);
  const visibleRows = await page.locator('tr.zA:visible').count();
  // 没有匹配邮件已经由上面的显式空结果信号确认；有邮件则必须核验分页结束。
  const complete = rows.length === 0 || (atEnd && visibleRows <= limit);
  return { status: 'ok', query, coverage: complete ? 'all_matching_rows' : 'first_page_only', returned: rows.length, limit, complete, rows };
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
async function verifySent(page, { query, previousIds, recipient, subject, body }) {
  const result = await searchMailbox(page, query);
  const candidates = result.rows.filter(row => row.id && !previousIds.has(row.id) && normalize(row.subject) === normalize(subject));
  if (candidates.length !== 1) return null;
  const rows = page.locator('tr.zA:visible');
  const matches = [];
  for (let i = 0; i < await rows.count(); i++) {
    const row = rows.nth(i);
    const id = await row.evaluate(node => node.getAttribute('data-legacy-thread-id') || node.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id'));
    if (id === candidates[0].id) matches.push(row);
  }
  if (matches.length !== 1) throw new OpsError('SENT_ID_AMBIGUOUS', '无法唯一定位已发送会话 ID', 2);
  await matches[0].click();
  const proof = await until(async () => page.evaluate(sentDOMProof, { recipient, subject, body }), { timeout: 8000, label: '已发送会话正文或收件人无法核验' });
  return proof ? { status: 'verified', evidence: { kind: 'independent_sent_mail_readback', threadId: candidates[0].id, recipientMatched: true, subjectMatched: true, bodyMatched: true, delivery: 'in_sent_not_recipient_delivery' } } : null;
}
module.exports = { mailboxBase, email, assertAccount, queryFromHash, searchMailbox, sentDOMProof, verifySent };
