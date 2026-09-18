'use strict';
// node scripts/aliyun/publish-article.js <title> <bodyMdFile> [abstract]
const { withPage } = require('../../lib/cdp');
const { run, readText, navigate, choose, button, fillEmpty, assertNoChallenge, until, OpsError } = require('../../lib/ops');
const { writeOnce } = require('../../lib/state');
const { validateTitle, fingerprints, plainMarkdown, insertEmpty, articleURL, verifyArticle, articleBodySelectors } = require('../../lib/articles');
async function main(args = process.argv.slice(2)) {
  articleBodySelectors('aliyun');
  const title = validateTitle(args[0]);
  const body = await readText(args[1]);
  fingerprints(plainMarkdown(body)); // 可核验性必须在任何提交之前检查。
  const abstract = args[2] || '';
  return writeOnce({ kind: 'aliyun.article', title, body, abstract }, ({ submit }) => withPage(async page => {
    await navigate(page, 'https://developer.aliyun.com/article/new', ['developer.aliyun.com']);
    const editor = await choose(page, [page.locator('.mditor textarea.textarea')], '可见 Markdown 编辑器');
    const titleBox = await choose(page, [page.getByPlaceholder(/标题/), page.getByRole('textbox', { name: /标题/ })], '文章标题');
    await fillEmpty(titleBox, title);
    await insertEmpty(page, editor, body);
    if (abstract) await fillEmpty(await choose(page, [page.getByPlaceholder('请填写摘要', { exact: true })], '摘要'), abstract);
    const publish = await button(page, '发布文章');
    // 首个“发布文章”也可能直接提交，必须在这次点击之前写台账。
    await submit(() => publish.click());
    const confirm = page.getByRole('button', { name: '确认', exact: true }).filter({ visible: true });
    const stage = await until(async () => {
      await assertNoChallenge(page);
      if (articleURL('aliyun', page.url())) return 'published';
      const count = await confirm.count();
      if (count > 1) throw new OpsError('AMBIGUOUS_SELECTOR', '多个确认按钮，拒绝猜测', 2);
      return count === 1 ? 'confirm' : null;
    }, { label: '未等到确认面板或文章结果，禁止重新点击发布' });
    if (stage === 'confirm') await confirm.click();
    return verifyArticle(page, 'aliyun', title, plainMarkdown(body));
  }, { keepOnError: true }));
}
if (require.main === module) run(main);
module.exports = main;
