// scripts/search-console/read-performance.js — GSC 效果报告（登录态在浏览器里）
// 用法: node read-performance.js
// 经验: performance 深链二刷即 400（Google 侧问题）——必须从属性首页侧栏点"效果"进入
const { withPage } = require('../../lib/cdp');

withPage(async (page) => {
  await page.goto('https://search.google.com/search-console?resource_id=sc-domain:aiworkstation.cn', { waitUntil: 'domcontentloaded', timeout: 50000 });
  await page.waitForTimeout(10000);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('a, span, div')].find(e => (e.textContent || '').trim() === '效果' && (e.offsetWidth || e.offsetHeight));
    if (t) t.click();
  });
  await page.waitForTimeout(12000);
  const t2 = await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n'));
  const queries = (t2.match(/(热门查询|Top queries)[\s\S]{0,400}/) || [''])[0];
  console.log(queries.slice(0, 400));
}, { reuse: p => p.url().includes('search.google.com') });
