// scripts/tencent-cloud/publish-article.js — Markdown 模式发文（Monaco 编辑器）
// 用法: node publish-article.js <title> <bodyMdFile>
// 三个静默失败根因（都已处理）:
//   1. 发布面板"文章来源"单选默认未选 → 必须点"原创"
//   2. 必须至少一个官方标签（建议项精确匹配点击），仅自定义词不行
//   3. locator 点击面板按钮偶发无效 → evaluate 点击 + 等 20s 看 CreateArticle 请求
const { withPage } = require('../../lib/cdp');
const fs = require('fs');
const [title, bodyFile] = process.argv.slice(2);
if (!title || !bodyFile) { console.error('usage: publish-article.js <title> <bodyMdFile>'); process.exit(1); }
const BODY = fs.readFileSync(bodyFile, 'utf8');

withPage(async (page) => {
  await page.goto('https://cloud.tencent.com/developer/article/write', { waitUntil: 'domcontentloaded', timeout: 50000 });
  await page.waitForTimeout(9000);
  await page.locator('text=暂不体验').first().click({ timeout: 3000 }).catch(() => {}); // 关掉新版编辑器推销
  const sw = page.locator('text=切换到Markdown编辑器').first();
  if (await sw.count()) { await sw.click({ timeout: 5000 }); await page.waitForTimeout(5000); }

  // 标题 + 正文（Monaco 用 keyboard.insertText 才可靠）
  const titleBox = page.locator('textarea.article-title').first();
  await titleBox.click(); await titleBox.fill(title);
  await page.locator('.inputarea').first().click({ timeout: 8000 });
  await page.keyboard.insertText(BODY);
  await page.waitForTimeout(2500);
  const len = await page.evaluate(() => {
    const ms = window.monaco && window.monaco.editor ? window.monaco.editor.getModels() : [];
    return ms.length ? ms[0].getValue().length : 0;
  });
  if (len < 200) { console.error('BODY FILL FAILED'); process.exit(1); }

  // 发布面板
  await page.locator('text=发布').first().click({ timeout: 8000 });
  await page.waitForTimeout(6000);

  // 关键 1: 原创
  await page.evaluate(() => {
    if (![...document.querySelectorAll('input[type="radio"]')].some(r => r.checked)) {
      const lbl = [...document.querySelectorAll('label, span, div')].find(e => (e.textContent || '').trim() === '原创' && e.offsetWidth);
      if (lbl) lbl.click();
    }
  });

  // 关键 2: 官方标签（搜索框 nth(0) 输入后点"文本完全相等"的建议项）
  const tagSearch = page.locator('input.com-2-tag-input').nth(0);
  await tagSearch.click({ timeout: 6000 });
  await tagSearch.type('人工智能', { delay: 90 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('li, [class*="sug"], [class*="option"], [class*="item"]')]
      .filter(e => e.offsetWidth && (e.textContent || '').trim() === '人工智能');
    if (items.length) items[0].click();
  });

  // 自定义关键词（选填，Enter 创建）
  const custom = page.locator('input.com-2-tag-input').nth(1);
  for (const kw of ['RAG', '知识库']) {
    await custom.click({ timeout: 6000 });
    await custom.fill('');
    await custom.type(kw, { delay: 80 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
  }

  // 关键 3: evaluate 点击确认发布，等成功弹窗
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '确认发布' && x.offsetWidth);
    if (b) b.click();
  });
  await page.waitForTimeout(20000);
  const r = await page.evaluate(() => {
    const dlg = document.querySelector('#dialog-root .c-modal');
    if (!dlg) return { ok: false };
    const link = [...dlg.querySelectorAll('a')].map(a => a.getAttribute('href')).find(h => h && /article\/\d+/.test(h));
    return { ok: /发布成功/.test(dlg.innerText || ''), articleUrl: link };
  });
  console.log(JSON.stringify(r));
  if (!r.ok) process.exit(2);
}, { reuse: p => p.url().includes('cloud.tencent.com') });
