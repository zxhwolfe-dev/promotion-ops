'use strict';
// node scripts/csdn/publish-article.js <title> <bodyMdFile> [abstract]
const { withPage } = require('../../lib/cdp');
const { run, requiredEnv, readText, navigate, choose, button, fillEmpty, until } = require('../../lib/ops');
const { writeOnce } = require('../../lib/state');
const { validateTitle, fingerprints, plainMarkdown, insertEmpty, selectTag, verifyArticle, articleBodySelectors } = require('../../lib/articles');
async function main(args = process.argv.slice(2)) {
  articleBodySelectors('csdn');
  const title = validateTitle(args[0]);
  const body = await readText(args[1]);
  fingerprints(plainMarkdown(body)); // 可核验性必须在任何提交之前检查。
  const abstract = args[2] || '';
  const account = requiredEnv('CSDN_USERNAME', /^[A-Za-z0-9_-]+$/);
  return writeOnce({ kind: 'csdn.article', account, title, body, abstract }, ({ submit }) => withPage(async page => {
    await navigate(page, 'https://editor.csdn.net/md?not_checkout=1', ['editor.csdn.net']);
    // CSDN 会在加载后异步恢复上次自动保存的草稿：先等恢复稳定，空态检查才可靠，
    // 否则会出现"填入与恢复叠加成双份"的竞态。
    await until(async () => {
      const read1 = await page.evaluate(() => document.querySelector('pre.editor__inner')?.textContent ?? null);
      if (read1 === null) return false;
      await page.waitForTimeout(1500);
      const read2 = await page.evaluate(() => document.querySelector('pre.editor__inner')?.textContent ?? null);
      return read1 === read2;
    }, { timeout: 20000, code: 'EDITOR_UNSTABLE', exitCode: 1, label: 'CSDN 编辑器草稿恢复未稳定' });
    const editor = await choose(page, [page.locator('pre.editor__inner[contenteditable]')], 'Markdown 正文');
    await insertEmpty(page, editor, body);
    await (await choose(page, [page.locator('.article-bar__title-display')], '标题激活区')).click();
    const titleBox = await choose(page, [page.getByPlaceholder(/标题/), page.locator('.article-bar__title input')], '标题输入框');
    await fillEmpty(titleBox, title);
    const openPublish = await button(page, '发布文章');
    await submit(() => openPublish.click()); // 从第一个发布按钮起，整个单次提交流程都进入保护区间。
    if (abstract) {
      const summary = await choose(page, [page.getByPlaceholder(/摘要/), page.locator('.modal textarea, [role="dialog"] textarea')], '摘要');
      await summary.fill(abstract);
    }
    await (await button(page, '添加文章标签')).click();
    const tagInput = await choose(page, [page.getByPlaceholder(/标签/)], '标签搜索');
    const tag = process.env.PROMO_ARTICLE_TAG || '人工智能';
    await tagInput.fill(tag); await selectTag(page, tag);
    const publish = await choose(page, [page.locator('button.btn-b-red').filter({ hasText: /^\s*发布文章\s*$/ })], '最终发布按钮');
    await publish.click(); // 本次面板的最终确认，只点一次。
    return verifyArticle(page, 'csdn', title, plainMarkdown(body), { expectedOwner: account });
  }, { keepOnError: true }));
}
if (require.main === module) run(main);
module.exports = main;
