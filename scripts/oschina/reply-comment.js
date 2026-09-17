// scripts/oschina/reply-comment.js — 文章评论区回复
// 用法: node reply-comment.js <articleUrl> <replyFile>
// 经验:
//   - fill() 不触发框架绑定（发布时内容为空被拒）：必须点击后 keyboard.type
//   - "发 布"按钮是 Ant Design 按钮，位置在文本框右侧 ~785px：邻近匹配找不到，用全局 className/坐标定位
const { withPage } = require('../../lib/cdp');
const fs = require('fs');
const [url, file] = process.argv.slice(2);
if (!url || !file) { console.error('usage: reply-comment.js <articleUrl> <replyFile>'); process.exit(1); }
const text = fs.readFileSync(file, 'utf8');

withPage(async (page) => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(10000);
  const ta = page.locator('textarea[placeholder*="发布评论"], textarea:visible').first();
  await ta.scrollIntoViewIfNeeded({ timeout: 10000 });
  await ta.click();
  await page.keyboard.type(text, { delay: 8 });
  await page.waitForTimeout(1500);

  const btn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').replace(/\s/g, '') === '发布' && /ant-btn/.test(x.className));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!btn) { console.error('publish btn not found'); process.exit(1); }
  await page.mouse.click(btn.x, btn.y);
  await page.waitForTimeout(12000);
  const ok = await page.evaluate((t) => (document.body.innerText.match(/评论[:：]\s*(\d+)/) || [])[1], text);
  console.log('comment count now:', ok);
});
