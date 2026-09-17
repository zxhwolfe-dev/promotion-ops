'use strict';
// node scripts/oschina/publish-article.js <title> <bodyHtmlFile>
const { withPage } = require('../../lib/cdp');
const { run, requiredEnv, readText, navigate, choose, button, fillEmpty, OpsError } = require('../../lib/ops');
const { writeOnce } = require('../../lib/state');
const { validateTitle, fingerprints, insertSafeHTML, verifyArticle } = require('../../lib/articles');
async function main(args = process.argv.slice(2)) {
  const title = validateTitle(args[0]);
  const html = await readText(args[1]);
  const account = requiredEnv('OSCHINA_UID', /^\d+$/);
  const url = `https://my.oschina.net/u/${account}/blog/ai-write`;
  return writeOnce({ kind: 'oschina.article', account, title, html }, ({ submit }) => withPage(async page => {
    await navigate(page, url, ['my.oschina.net']);
    if (new URL(page.url()).pathname !== new URL(url).pathname) throw new OpsError('EDITOR_REDIRECT', '编辑入口发生重定向，拒绝修改可能属于旧文的页面', 3);
    await fillEmpty(await choose(page, [page.getByPlaceholder('请输入文章标题', { exact: true })], '文章标题'), title);
    const editor = await choose(page, [page.locator('.tiptap.ProseMirror')], '正文编辑器');
    const text = await insertSafeHTML(page, editor, html);
    fingerprints(text);
    const openPublish = await button(page, '发布文章');
    await submit(() => openPublish.click()); // 从第一个发布按钮起，整个单次提交流程都进入保护区间。
    const confirm = await button(page, '确定并发布');
    await confirm.click(); // 本次面板最终确认，只点一次。
    return verifyArticle(page, 'oschina', title, text, { expectedOwner: account });
  }, { keepOnError: true }));
}
if (require.main === module) run(main);
module.exports = main;
