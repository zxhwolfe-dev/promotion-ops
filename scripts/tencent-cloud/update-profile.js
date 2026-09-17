// scripts/tencent-cloud/update-profile.js — 昵称/简介/网址
// 用法: node update-profile.js <nickname> <bio(≤50字)> <website>
// 经验: 简介超 50 个中文字符会被接口拒绝（UpdateUserProfile 返回 code -9993）
const { withPage } = require('../../lib/cdp');
const [nick, bio, site] = process.argv.slice(2);

withPage(async (page) => {
  // UID 按实际情况替换，或从 header 的用户链接抓取
  await page.goto('https://cloud.tencent.com/developer/user/12765352/profile', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(7000);
  await page.evaluate((d) => {
    const setVal = (el, val) => {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const n = [...document.querySelectorAll('input')].find(i => /^用户\d+$/.test(i.value || '') || i.placeholder === '当前昵称');
    if (n && d.nick) setVal(n, d.nick);
    const b = document.querySelector('textarea[placeholder="个人简介"]');
    if (b && d.bio) setVal(b, d.bio);
    const s = document.querySelector('input[placeholder="www.xxx.com"]');
    if (s && d.site) setVal(s, d.site);
  }, { nick, bio, site });
  await page.waitForTimeout(1500);
  await page.locator('button.c-btn:has-text("确认提交")').first().click({ timeout: 8000 });
  await page.waitForTimeout(9000);
  console.log('submitted; 昵称需平台审核后生效');
}, { reuse: p => p.url().includes('cloud.tencent.com') });
