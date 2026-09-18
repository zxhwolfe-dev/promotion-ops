'use strict';
const { withPage } = require('../../lib/cdp');
const { run, navigate, until, trustedURL, OpsError, errorResult } = require('../../lib/ops');
async function main(queries = process.argv.slice(2)) {
  if (!queries.length || queries.length > 10 || queries.some(query => !query.trim())) throw new OpsError('INVALID_QUERY', '请提供 1–10 个非空搜索词');
  return withPage(async page => {
    const results = [];
    for (const query of queries) {
      try {
        await navigate(page, 'https://www.reddit.com/search/?q=' + encodeURIComponent(query) + '&sort=new&t=week', ['www.reddit.com']);
        await until(async () => (await page.locator('a[data-testid="post-title"], a[slot="title"]').count()) ||
          (await page.getByText(/No results found|未找到任何结果/i).filter({ visible: true }).count()), { label: '搜索结果尚未确认，不能返回伪空列表' });
        const raw = await page.locator('a[data-testid="post-title"], a[slot="title"]').evaluateAll(nodes => nodes.map(node => ({ title: node.textContent.trim(), url: node.href })));
        const seen = new Set();
        const items = raw.filter(item => {
          try { trustedURL(item.url, ['www.reddit.com', 'old.reddit.com', 'reddit.com'], /^\/r\/[^/]+\/comments\//); } catch { return false; }
          if (!item.title || seen.has(item.url)) return false;
          seen.add(item.url); return true;
        });
        results.push({ query, status: 'ok', items: items.slice(0, 6), truncated: items.length > 6 });
      } catch (error) { results.push({ query, status: 'unavailable', error: errorResult(error) }); }
    }
    return { status: results.every(item => item.status === 'ok') ? 'ok' : 'partial', results };
  });
}
if (require.main === module) run(main);
module.exports = main;
