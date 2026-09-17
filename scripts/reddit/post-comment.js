'use strict';
// node scripts/reddit/post-comment.js <threadUrl> <bodyFile>
const { withPage, withReadPage } = require('../../lib/cdp');
const { run, requiredEnv, readText, navigate, choose, button, until, normalize, OpsError } = require('../../lib/ops');
const { writeOnce } = require('../../lib/state');
const { plainMarkdown } = require('../../lib/articles');
const { redditThread, redditComments, findRedditComment } = require('../../lib/comments');
async function main(args = process.argv.slice(2)) {
  const thread = redditThread(args[0]);
  const text = await readText(args[1]);
  const author = requiredEnv('REDDIT_USERNAME', /^[A-Za-z0-9_-]+$/);
  const profile = `https://old.reddit.com/user/${author}/comments/`;
  return writeOnce({ kind: 'reddit.comment', author, threadId: thread.id, text }, ({ submit }) => withPage(async page => {
    await navigate(page, thread.url, ['old.reddit.com']);
    const account = await choose(page, [page.locator('#header-bottom-right .user a').filter({ hasText: new RegExp(`^${author}$`, 'i') })], '当前 Reddit 账号');
    if (normalize(await account.innerText()).toLowerCase() !== author.toLowerCase()) throw new OpsError('ACCOUNT_MISMATCH', 'Reddit 登录账号不匹配', 3);
    const previousIds = await withReadPage(page.context(), async readPage => {
      await navigate(readPage, profile, ['old.reddit.com']);
      await choose(readPage, [readPage.locator('#siteTable'), readPage.locator('.sitetable')], '个人评论列表');
      return new Set((await redditComments(readPage)).map(row => row.id));
    });
    const form = page.locator('.commentarea > form.usertext');
    const textarea = await choose(page, [form.locator('textarea[name="text"]')], '主帖评论编辑框');
    if ((await textarea.inputValue()).trim()) throw new OpsError('EXISTING_DRAFT', '评论框已有内容，拒绝覆盖', 3);
    await textarea.fill(text);
    const save = await button(page, /^save$/i, form);
    await submit(() => save.click());
    return withReadPage(page.context(), async readPage => {
      const match = await until(async () => {
        await navigate(readPage, profile, ['old.reddit.com']);
        return findRedditComment(await redditComments(readPage), { previousIds, author, text: plainMarkdown(text), threadId: thread.id });
      }, { timeout: 30000, interval: 2000, label: '个人主页未出现本账号对目标帖子的新评论；禁止按固定间隔盲目重发' });
      return { status: 'verified', commentUrl: match.url, evidence: { kind: 'independent_profile_readback', commentId: match.id, authorMatched: true, threadMatched: true, bodyMatched: true, visibility: 'account_only_not_public_guarantee' } };
    });
  }, { keepOnError: true }));
}
if (require.main === module) run(main);
module.exports = main;
