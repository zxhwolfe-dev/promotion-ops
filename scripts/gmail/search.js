// scripts/gmail/search.js — 可靠的搜索：编码 hash URL + 处理不了时点搜索按钮兜底
// 用法: node scripts/gmail/search.js "to:someone@example.com"
const { withPage } = require('../../lib/cdp');
const q = process.argv[2];
if (!q) { console.error('usage: node search.js <query>'); process.exit(1); }

withPage(async (page) => {
  await page.goto('https://mail.google.com/mail/u/0/#search/' + encodeURIComponent(q), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(12000);
  let isSearch = await page.evaluate(() => location.hash.includes('search'));
  if (!isSearch) {
    // SPA 吞掉 hash 的兜底：搜索框实键输入 + 点搜索按钮
    const box = page.locator('input[name="q"]').first();
    await box.click({ timeout: 8000 });
    await page.keyboard.type(q, { delay: 40 });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button, [role="button"]')].find(b => /搜索|search/i.test(b.getAttribute('aria-label') || ''));
      if (btn) btn.click();
    });
    await page.waitForTimeout(10000);
  }
  const rows = await page.evaluate(() => [...document.querySelectorAll('tr.zA')].slice(0, 10).map(tr => ({
    from: tr.querySelector('.yP, .yW span')?.textContent?.trim() || '',
    subject: tr.querySelector('.bog, .y6')?.textContent?.trim() || '',
  })));
  console.log(JSON.stringify(rows, null, 2));
}, { reuse: p => p.url().includes('mail.google.com') });
