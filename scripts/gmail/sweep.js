// scripts/gmail/sweep.js — 收件箱全量检查（顶行遍历；搜索框/标签 hash 常被 SPA 吞掉，勿依赖）
// 用法: node scripts/gmail/sweep.js
const { withPage } = require('../../lib/cdp');

withPage(async (page) => {
  await page.goto('https://mail.google.com/mail/u/0/#inbox', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('tr.zA', { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const rows = await page.evaluate(() => {
    const out = [];
    for (const tr of document.querySelectorAll('tr.zA')) {
      out.push({
        from: tr.querySelector('.yP, .bA4 span, .yW span')?.textContent?.trim() || '',
        subject: tr.querySelector('.bog, .y6')?.textContent?.trim() || '',
        date: tr.querySelector('.xW.xY span')?.getAttribute('title') || '',
      });
      if (out.length >= 15) break;
    }
    return out;
  });
  console.log(JSON.stringify(rows, null, 2));
}, { reuse: p => p.url().includes('mail.google.com') });
