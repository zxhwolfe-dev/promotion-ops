// scripts/gmail/compose-send.js — 撰写并发送，发送后必须用 search.js 验证（Ctrl+Enter 偶发无效）
// 用法: node compose-send.js <to> <subject> <bodyFile>
const { withPage } = require('../../lib/cdp');
const fs = require('fs');
const [to, subject, bodyFile] = process.argv.slice(2);
if (!to || !subject || !bodyFile) { console.error('usage: compose-send.js <to> <subject> <bodyFile>'); process.exit(1); }
const body = fs.readFileSync(bodyFile, 'utf8');

withPage(async (page) => {
  await page.goto('https://mail.google.com/mail/u/0/#inbox?compose=new', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  const toInput = page.locator('input[aria-label="发送至收件人"], textarea[name="to"]').first();
  await toInput.waitFor({ state: 'visible', timeout: 15000 });
  await toInput.fill(to);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(800);
  await page.locator('input[name="subjectbox"]').first().fill(subject);
  const editor = page.locator('div[aria-label="邮件正文"], div[role="textbox"][aria-label*="正文"]').first();
  await editor.click();
  await page.keyboard.type(body, { delay: 5 });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Control+Enter');
  console.log('sent (verify with search.js to:' + to + ')');
}, { reuse: p => p.url().includes('mail.google.com') });
