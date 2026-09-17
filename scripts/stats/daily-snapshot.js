// scripts/stats/daily-snapshot.js — 全内容平台数据快照（输出 JSON，入台账 promotion-metrics.md）
// 用法: node daily-snapshot.js
// 注意: 各站阅读数提取口径不稳（SPA 改版频繁），取不到记 null，不猜数
const { withPage } = require('../../lib/cdp');

const TARGETS = [
  ['tencent', 'https://cloud.tencent.com/developer/article/2744103'],
  ['aliyun', 'https://developer.aliyun.com/article/1764254'],
  ['csdn', 'https://blog.csdn.net/aiworkstation/article/details/164187717'],
  ['oschina', 'https://my.oschina.net/u/9763974/blog/19759257'],
  ['dev', 'https://dev.to/'], // 换成实际文章 URL
];

withPage(async (page) => {
  const out = {};
  for (const [tag, u] of TARGETS) {
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(7000);
      out[tag] = await page.evaluate(() => {
        const t = document.body.innerText;
        const grab = (re) => (t.match(re) || [])[1] || null;
        return { reads: grab(/(\d[\d,]*)\s*(?:阅读|阅读量|views)/i), likes: grab(/(\d+)\s*(?:赞|likes|点赞)/i), comments: grab(/(?:评论|comments)[^\d]{0,4}(\d+)/i) };
      });
    } catch (e) { out[tag] = { err: e.message.split('\n')[0] }; }
  }
  // Reddit 评论分数
  try {
    await page.goto('https://old.reddit.com/user/zxhwolfe/comments', { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000);
    out.reddit = await page.evaluate(() => [...document.querySelectorAll('.thing.comment')].slice(0, 5).map(c => ({
      sub: c.querySelector('.subreddit')?.textContent?.trim() || '',
      score: c.querySelector('.score.unvoted')?.textContent?.trim() || '',
    })));
  } catch (e) { out.reddit = { err: 'ERR' }; }
  console.log(JSON.stringify(out, null, 2));
});
