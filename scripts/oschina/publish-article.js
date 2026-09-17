// scripts/oschina/publish-article.js — 智写编辑器（tiptap/ProseMirror）发文
// 用法: node publish-article.js <title> <bodyHtmlFile>
// 经验:
//   - 入口 https://my.oschina.net/u/<uid>/blog/ai-write；tiptap 用 execCommand insertHTML
//   - 裸 URL 不会被自动链接化，需自己包 <a href>
//   - 发布面板可能已处于打开状态（按钮"确定并发布"），先查再点
//   - 多标签匹配必须精确完整路径（曾因 'ai-write' 前缀匹配误点开旧文编辑器，险些覆盖旧文）
const { withPage } = require('../../lib/cdp');
const fs = require('fs');
const [title, htmlFile] = process.argv.slice(2);
if (!title || !htmlFile) { console.error('usage: publish-article.js <title> <bodyHtmlFile>'); process.exit(1); }
const HTML = fs.readFileSync(htmlFile, 'utf8');

withPage(async (page) => {
  await page.goto('https://my.oschina.net/u/9763974/blog/ai-write', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(9000);
  await page.locator('input[placeholder="请输入文章标题"]').first().fill(title);

  const body = page.locator('.tiptap.ProseMirror').first();
  await body.waitFor({ state: 'visible', timeout: 20000 });
  await body.click();
  await page.evaluate((html) => {
    const el = document.querySelector('.tiptap.ProseMirror');
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertHTML', false, html);
  }, HTML);
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '发布文章' && (b.offsetWidth || b.offsetHeight));
    if (btn) btn.click();
  });
  await page.waitForTimeout(8000);
  // 面板可能已开：优先"确定并发布"
  const r = await page.evaluate(() => {
    const confirm = [...document.querySelectorAll('button')].find(x => x.offsetWidth && /确定并发布/.test((x.textContent || '').replace(/\s/g, '')));
    if (confirm) { confirm.click(); return 'confirming'; }
    return 'panel not open';
  });
  console.log(r);
  await page.waitForTimeout(15000);
  const final = await page.evaluate(() => ({
    redirected: /\/blog\/\d+/.test(location.href),
    url: location.href,
  }));
  console.log(JSON.stringify(final)); // redirected=true 即发布成功
});
