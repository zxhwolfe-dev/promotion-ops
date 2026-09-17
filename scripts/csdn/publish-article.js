// scripts/csdn/publish-article.js — editor.csdn.net/md（contenteditable pre 编辑器）
// 用法: node publish-article.js <title> <bodyMdFile> <abstract>
// 经验:
//   - 标题是"显示 div"(.article-bar__title-display)：JS focus() 无效，必须 Playwright 真实点击激活成 input 再 Ctrl+A+type
//   - 正文 pre.editor__inner contenteditable：点击 → Ctrl+A → Delete → keyboard.insertText
//   - 发布按钮可能在视口外(y>1000)：用 locator(自动滚动) 点击，勿用 evaluate 坐标
//   - 发布可能触发微信扫码确认(passport-login 浮层)：交人工，扫完发布自动完成
const { withPage } = require('../../lib/cdp');
const fs = require('fs');
const [title, bodyFile, abstract] = process.argv.slice(2);
if (!title || !bodyFile) { console.error('usage: publish-article.js <title> <bodyMdFile> <abstract>'); process.exit(1); }
const BODY = fs.readFileSync(bodyFile, 'utf8');

withPage(async (page) => {
  await page.goto('https://editor.csdn.net/md?not_checkout=1', { waitUntil: 'domcontentloaded', timeout: 50000 });
  await page.waitForTimeout(10000);

  // 正文先行（避免标题文本误入正文）
  const pre = page.locator('pre.editor__inner').first();
  await pre.click({ timeout: 8000 });
  await page.keyboard.insertText(BODY);
  await page.waitForTimeout(1500);

  // 标题：真实点击显示 div → input 激活
  await page.locator('.article-bar__title-display').first().click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await page.keyboard.press('Control+a');
  await page.keyboard.type(title, { delay: 20 });

  // 打开发布面板
  await page.locator('button', { hasText: '发布文章' }).first().click({ timeout: 8000 });
  await page.waitForTimeout(6000);

  // 摘要（原生 setter）
  await page.evaluate((abs) => {
    const ta = document.querySelector('.modal textarea, [class*="dialog"] textarea, textarea');
    if (ta && (!ta.value || ta.value.length < 10)) {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(ta, abs);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, abstract || '');

  // 标签（官方建议项精确点击）
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.offsetWidth && /添加文章标签/.test(x.textContent || ''));
    if (b) b.click();
  });
  await page.waitForTimeout(2500);
  const ti = page.locator('input[placeholder*="标签"]').first();
  if (await ti.count()) {
    await ti.click();
    await ti.type('人工智能', { delay: 80 });
    await page.waitForTimeout(1800);
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('li, [class*="sug"], [class*="tag-item"]')].filter(e => e.offsetWidth && (e.textContent || '').trim() === '人工智能');
      if (items.length) items[0].click();
    });
  }

  // 发布（locator 自动滚动点击）
  await page.locator('button.btn-b-red:has-text("发布文章")').first().click({ timeout: 10000 });
  await page.waitForTimeout(20000);
  const r = await page.evaluate(() => ({
    wechatQr: !!document.querySelector('.passport-login-mark2'),
    successPage: /creation\/success/.test(location.href),
    articleId: (location.href.match(/articleId=(\d+)/) || [])[1] || null,
  }));
  console.log(JSON.stringify(r));
  if (r.wechatQr) { console.error('微信扫码确认出现：需人工扫码，扫完发布自动完成'); process.exit(3); }
});
