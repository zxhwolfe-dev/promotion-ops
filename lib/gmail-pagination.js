'use strict';
const { until } = require('./ops');

// Keep a bounded, honest thread-list snapshot; never call a sliced last page complete.
async function collectMailboxPages(page, matchesQuery, limit, { maxPages = 10, pageTimeout = 15000 } = {}) {
  const rows = [], seen = new Set();
  let pages = 0, reason = null, complete = false;
  const visibleRows = () => page.locator('tr.zA:visible');
  const older = () => page.getByRole('button', { name: /^(?:Older|较旧|更早|较早|下一页(?:结果)?|Next page(?: of results)?)$/i }).filter({ visible: true });
  const sample = () => visibleRows().evaluateAll(nodes => nodes.map(node => ({
    id: node.getAttribute('data-legacy-thread-id') || node.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id') || null,
    from: node.querySelector('.yP, .yW span')?.textContent?.trim() || '',
    subject: node.querySelector('.bog')?.textContent?.trim() || '',
    snippet: node.querySelector('.y2')?.textContent?.trim() || '',
    date: node.querySelector('.xW.xY span')?.getAttribute('title') || null,
  })));
  while (pages < maxPages) {
    if (!matchesQuery()) { reason = 'query_changed'; break; }
    const current = await sample();
    pages++;
    if (!current.length) {
      // The caller verified explicit empty-result text before the first sample.
      complete = pages === 1;
      if (!complete) reason = 'unexpected_empty_page';
      break;
    }
    if (current.some(row => !row.id)) { reason = 'missing_thread_id'; break; }
    if (new Set(current.map(row => row.id)).size !== current.length || current.some(row => seen.has(row.id))) {
      reason = 'overlapping_or_duplicate_page'; break;
    }
    const remaining = limit - rows.length;
    rows.push(...current.slice(0, remaining));
    current.forEach(row => seen.add(row.id));
    if (current.length > remaining) { reason = 'row_limit'; break; }
    const next = older();
    if (await next.count() !== 1) { reason = 'pagination_control_unverified'; break; }
    if (await next.evaluate(el => el.getAttribute('aria-disabled') === 'true' || el.disabled === true)) {
      complete = true; break;
    }
    if (rows.length >= limit) { reason = 'row_limit'; break; }
    if (pages >= maxPages) { reason = 'page_limit'; break; }
    try {
      await next.click();
      await until(async () => {
        if (!matchesQuery()) return false;
        const ids = await visibleRows().evaluateAll(nodes => nodes.map(node =>
          node.getAttribute('data-legacy-thread-id') || node.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id')));
        return ids.length > 0 && ids.every(id => id && !seen.has(id));
      }, { timeout: pageTimeout, code: 'PAGINATION_STALLED', label: '翻页后未确认新会话页，不能宣称已到末页' });
    } catch (error) { reason = error.code || 'PAGINATION_ERROR'; break; }
  }
  return { status: complete ? 'ok' : 'partial', complete,
    coverage: complete ? (pages > 1 ? 'paged_to_end' : 'all_matching_rows') : (pages > 1 ? 'partial_pages' : 'first_page_only'),
    scope: 'matching_thread_summaries_not_message_bodies', returned: rows.length, limit, pagesWalked: pages,
    ...(reason ? { paginationError: reason } : {}), rows };
}
module.exports = { collectMailboxPages };
