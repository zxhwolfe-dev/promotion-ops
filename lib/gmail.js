'use strict';
const { OpsError, navigate, choose, until, normalize, assertNoChallenge } = require('./ops');
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
  try { return decodeURIComponent(hash.replace(/^#search\//, '')); } catch { return ''; }
}
async function searchMailbox(page, query, limit = 50, options = {}) {
  if (typeof query !== 'string' || !query.trim() || query.length > 2000 || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new OpsError('INVALID_SEARCH', '搜索词须非空，limit 须为 1–500 的整数');
  }
  const url = mailboxBase() + '#search/' + encodeURIComponent(query);
  if (page.url() === url) await page.reload({ waitUntil: 'domcontentloaded', timeout: 35000 });
  else await navigate(page, url, ['mail.google.com']);
  const box = await choose(page, [page.locator('input[name="q"]')], 'Gmail 搜索框');
  if (queryFromHash(new URL(page.url()).hash) !== query || (await box.inputValue()) !== query) {
    await box.fill(query); // 不在旧查询后追加。
    await box.press('Enter');
  }
  await until(async () => {
    await assertNoChallenge(page);
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
  const rowIds = () => page.locator('tr.zA:visible').evaluateAll(nodes => nodes.map(node =>
    node.getAttribute('data-legacy-thread-id') || node.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id')).filter(Boolean));
  const older = () => page.getByRole('button', { name: /^(?:Older|较旧|更早|下一页)$/i }).filter({ visible: true });
  const readOlderDisabled = async () => {
    const button = older();
    return (await button.count()) === 1 && await button.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.disabled === true);
  };
  const collectRows = () => page.locator('tr.zA:visible').evaluateAll((nodes, max) => nodes.slice(0, max).map(node => ({
    id: node.getAttribute('data-legacy-thread-id') || node.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id') || null,
    from: node.querySelector('.yP, .yW span')?.textContent?.trim() || '',
    subject: node.querySelector('.bog')?.textContent?.trim() || '',
    date: node.querySelector('.xW.xY span')?.getAttribute('title') || null,
  })), limit);
  let atEnd = await readOlderDisabled();
  // 有界分页：翻到 Older 禁用或达到 limit/maxPages 为止；任何一页异常都返回 partial。
  const seen = new Set(rows.map(row => row.id).filter(Boolean));
  const maxPages = Number.isInteger(options.maxPages) && options.maxPages >= 1 && options.maxPages <= 50 ? options.maxPages : 10;
  let pages = 1, paginationError = null;
  while (!atEnd && rows.length < limit && pages < maxPages) {
    try {
      await older().click();
      await until(async () => {
        if (queryFromHash(new URL(page.url()).hash) !== query) return false;
        const ids = await rowIds();
        return ids.length > 0 && ids.some(id => !seen.has(id));
      }, { timeout: 15000, code: 'PAGINATION_STALLED', exitCode: 2, label: '翻页后未出现新会话，不能宣称已到末页' });
      for (const row of await collectRows()) if (row.id && !seen.has(row.id)) { seen.add(row.id); rows.push(row); }
      atEnd = await readOlderDisabled();
      pages++;
    } catch (error) { paginationError = error.code || 'PAGINATION_ERROR'; break; }
  }
  // 没有匹配邮件已经由上面的显式空结果信号确认；有邮件则必须核验分页结束。
  const complete = rows.length === 0 || (atEnd && !paginationError);
  return { status: complete ? 'ok' : 'partial', query, coverage: complete ? (pages > 1 ? 'paged_to_end' : 'all_matching_rows') : 'first_page_only',
    returned: rows.length, limit, complete, pagesWalked: pages, ...(paginationError ? { paginationError } : {}), rows };
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
  const rows = page.locator('tr.zA:visible');
  const matches = [];
  for (let i = 0; i < await rows.count(); i++) {
    const row = rows.nth(i);
    const id = await row.evaluate(node => node.getAttribute('data-legacy-thread-id') || node.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id'));
    if (id === threadId) matches.push(row);
  }
  if (matches.length !== 1) return false;
  await matches[0].click();
  return true;
}
async function verifySent(page, { query, previousIds, recipient, subject, body, account }) {
  const result = await searchMailbox(page, query);
  if (account) await assertAccount(page, account);
  const candidates = result.rows.filter(row => row.id && !previousIds.has(row.id) && normalize(row.subject) === normalize(subject));
  if (candidates.length !== 1) {
    // 同主题会话合并：Gmail 可能把新发送并入既有线程（不产生新 thread id）。
    // 在基线线程中逐个开信核验（有界 3 个）；正文+收件人绑定在同一 .adn 消息节点才作数。
    const baseline = result.rows.filter(row => row.id && previousIds.has(row.id) && normalize(row.subject) === normalize(subject)).slice(0, 3);
    for (const row of baseline) {
      const clicked = await openThreadById(page, row.id);
      if (!clicked) continue;
      const proof = await page.evaluate(sentDOMProof, { recipient, subject, body }).catch(() => false);
      if (proof) return { status: 'verified', evidence: { kind: 'merged_thread_readback', threadId: row.id, mergedIntoBaselineThread: true, recipientMatched: true, subjectMatched: true, bodyMatched: true, delivery: 'in_sent_not_recipient_delivery' } };
    }
    return null;
  }
  if (!(await openThreadById(page, candidates[0].id))) throw new OpsError('SENT_ID_AMBIGUOUS', '无法唯一定位已发送会话 ID', 2);
  const proof = await until(async () => page.evaluate(sentDOMProof, { recipient, subject, body }), { timeout: 8000, label: '已发送会话正文或收件人无法核验' });
  return proof ? { status: 'verified', evidence: { kind: 'independent_sent_mail_readback', threadId: candidates[0].id, recipientMatched: true, subjectMatched: true, bodyMatched: true, delivery: 'in_sent_not_recipient_delivery' } } : null;
}
module.exports = { mailboxBase, email, assertAccount, queryFromHash, searchMailbox, sentDOMProof, verifySent };
