'use strict';
// node scripts/tencent-cloud/publish-article.js <title> <bodyMdFile>
const { withPage } = require('../../lib/cdp');
const { run, requiredEnv, readText, navigate, choose, button, fillEmpty, until, OpsError } = require('../../lib/ops');
const { writeOnce } = require('../../lib/state');
const { validateTitle, fingerprints, plainMarkdown, selectTag, verifyArticle } = require('../../lib/articles');
async function main(args = process.argv.slice(2)) {
  const title = validateTitle(args[0]);
  const body = await readText(args[1]);
  fingerprints(plainMarkdown(body)); // 可核验性必须在任何提交之前检查。
  const account = requiredEnv('TENCENT_UID', /^\d+$/);
  return writeOnce({ kind: 'tencent.article', account, title, body }, ({ submit }) => withPage(async page => {
    await navigate(page, 'https://cloud.tencent.com/developer/article/write', ['cloud.tencent.com']);
    const dismiss = page.getByText('暂不体验', { exact: true }).filter({ visible: true });
    if (await dismiss.count() === 1) await dismiss.click();
    const markdown = page.getByText('切换到Markdown编辑器', { exact: true }).filter({ visible: true });
    if (await markdown.count() === 1) await markdown.click();
    const titleBox = await choose(page, [page.getByPlaceholder(/标题/), page.locator('textarea.article-title')], '标题');
    await fillEmpty(titleBox, title);
    const editor = await choose(page, [page.locator('.monaco-editor .inputarea'), page.locator('.inputarea')], 'Monaco 编辑器');
    const readModel = () => page.evaluate(() => {
      const models = window.monaco?.editor?.getModels() || [];
      return models.length === 1 ? models[0].getValue() : null;
    });
    const previous = await readModel();
    if (previous === null) throw new OpsError('MONACO_MODEL_AMBIGUOUS', '没有唯一的 Monaco 模型，拒绝猜测编辑对象');
    if (previous.trim()) throw new OpsError('EXISTING_DRAFT', 'Monaco 已有草稿，拒绝覆盖', 3);
    await editor.click(); await page.keyboard.insertText(body);
    await until(async () => (await readModel()) === body, { code: 'FILL_MISMATCH', exitCode: 1, label: 'Monaco 正文回读不一致' });
    const openPublish = await button(page, '发布');
    await submit(() => openPublish.click()); // 从第一个发布按钮起，整个单次提交流程都进入保护区间。
    const original = await choose(page, [page.getByRole('radio', { name: '原创', exact: true }), page.getByText('原创', { exact: true })], '文章来源：原创');
    await original.click();
    const tag = process.env.PROMO_ARTICLE_TAG || '人工智能';
    const tagInputs = page.locator('input.com-2-tag-input:visible');
    await until(async () => (await tagInputs.count()) === 2, { code: 'SELECTOR_MISSING', exitCode: 1, label: '标签面板结构改变，需重新核验官方/自定义输入框' });
    await tagInputs.nth(0).fill(tag); // 仅在两个已知输入框的结构断言后使用索引。
    await selectTag(page, tag);
    const confirm = await button(page, '确认发布');
    await confirm.click(); // 本次面板最终确认；绝不补 evaluate.click() 重试。
    return verifyArticle(page, 'tencent', title, plainMarkdown(body));
  }, { keepOnError: true }));
}
if (require.main === module) run(main);
module.exports = main;
