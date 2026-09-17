// scripts/reddit/post-comment.js — old.reddit 表单发评论（新版编辑器难触发，勿用）
// 用法: node post-comment.js <threadUrl> <bodyFile>
// 经验: 连发会被静默限流（发出无报错但个人主页不出现）→ 隔 2 小时再试；验证必须查个人主页
const { withPage } = require('../../lib/cdp');
const fs = require('fs');
const [url, bodyFile] = process.argv.slice(2);
if (!url || !bodyFile) { console.error('usage: post-comment.js <threadUrl> <bodyFile>'); process.exit(1); }
const text = fs.readFileSync(bodyFile, 'utf8');

withPage(async (page) => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);
  const ta = page.locator('.commentarea > form.usertext textarea[name="text"]').first();
  await ta.waitFor({ state: 'visible', timeout: 12000 });
  await ta.fill(text);
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const f = document.querySelector('.commentarea > form.usertext');
    const btn = f && [...f.querySelectorAll('.usertext-buttons button')].find(b => /save/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await page.waitForTimeout(10000);
  // 验证：个人主页最新评论
  await page.goto('https://old.reddit.com/user/zxhwolfe/comments', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);
  const top = await page.evaluate(() => [...document.querySelectorAll('.thing.comment')].slice(0, 2).map(t => ({
    sub: t.querySelector('.subreddit')?.textContent?.trim() || '',
    head: t.querySelector('.usertext-body')?.innerText?.slice(0, 40) || '',
  })));
  console.log(JSON.stringify(top, null, 2));
});
