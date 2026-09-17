// scripts/reddit/demand-search.js — 新帖搜索找可回答的需求帖
// 用法: node demand-search.js "query1" "query2" ...
const { withPage } = require('../../lib/cdp');
const queries = process.argv.slice(2);
if (!queries.length) { console.error('usage: demand-search.js <queries...>'); process.exit(1); }

withPage(async (page) => {
  for (const q of queries) {
    await page.goto('https://www.reddit.com/search/?q=' + encodeURIComponent(q) + '&sort=new&t=week', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    const items = await page.evaluate(() => {
      const posts = [];
      document.querySelectorAll('a[data-testid="post-title"], a[slot="title"]').forEach(a => {
        const t = (a.textContent || '').trim();
        const h = a.getAttribute('href') || '';
        if (t.length > 25 && !posts.find(p => p.t === t)) posts.push({ t: t.slice(0, 90), h: h.slice(0, 80) });
      });
      return posts.slice(0, 6);
    });
    console.log('\n===== ' + q + ' =====');
    items.forEach(i => console.log('-', i.t, '=>', i.h));
  }
});
