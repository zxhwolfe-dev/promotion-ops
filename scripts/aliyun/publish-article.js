// scripts/aliyun/publish-article.js — mditor 编辑器发文
// 用法: node publish-article.js <title> <bodyMdFile> <abstract(≤?字)>
// 经验:
//   - mditor 的编辑面是"内部可见 textarea"(.mditor textarea.textarea)；.mditor-hidden 是镜像，程序化改镜像无效
//   - 标题是独立 <input>（y 位置在正文上方），不是 textarea
//   - 正文用 keyboard.insertText；标题/摘要用原生 setter + input 事件
//   - 草稿抽屉的遮罩用 Escape 关
//   - 连续发布会触发阿里滑块验证码 → 按规则交人工，拖完发布自动完成
const { withPage } = require('../../lib/cdp');
const fs = require('fs');
const [title, bodyFile, abstract] = process.argv.slice(2);
if (!title || !bodyFile) { console.error('usage: publish-article.js <title> <bodyMdFile> <abstract>'); process.exit(1); }
const BODY = fs.readFileSync(bodyFile, 'utf8');

withPage(async (page) => {
  await page.goto('https://developer.aliyun.com/article/new', { waitUntil: 'domcontentloaded', timeout: 50000 });
  await page.waitForTimeout(10000);

  const md = page.locator('.mditor textarea.textarea').first();
  await md.click({ timeout: 10000 });
  await page.keyboard.insertText(BODY);
  await page.waitForTimeout(2000);
  await page.evaluate((d) => {
    const inp = [...document.querySelectorAll('input')].find(i => i.offsetWidth && i.type === 'text' && i.getBoundingClientRect().y > 100 && i.getBoundingClientRect().y < 340);
    if (inp) {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(inp, d.title);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const ta = document.querySelector('textarea[placeholder="请填写摘要"]');
    if (ta) {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(ta, d.abs || '');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, { title, abs: abstract || '' });
  await page.waitForTimeout(2000);

  const st = await page.evaluate(() => ({
    bodyLen: (document.querySelector('.mditor textarea.textarea') || { value: '' }).value.length,
    preview: document.body.innerText.length > 0,
  }));
  if (st.bodyLen < 200) { console.error('BODY FILL FAILED'); process.exit(1); }

  await page.locator('text=存为草稿').first().click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(7000);
  await page.locator('button', { hasText: '发布文章' }).first().click({ timeout: 8000 });
  await page.waitForTimeout(4000);
  const ok = page.locator('button', { hasText: '确认' }).first();
  if (await ok.count()) await ok.click({ timeout: 6000 });
  await page.waitForTimeout(18000);

  const r = await page.evaluate(() => ({
    captcha: !!document.querySelector('#aliyunCaptcha-mask'),
    articleId: (location.href.match(/article\/(\d+)/) || [])[1] || null,
  }));
  console.log(JSON.stringify(r));
  if (r.captcha) { console.error('滑块验证码出现：需人工拖动，拖完发布会自动完成'); process.exit(3); }
}, { reuse: p => p.url().includes('developer.aliyun.com') });
