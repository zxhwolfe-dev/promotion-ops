'use strict';
// 当前能力是在文章下发评论，不是假装已经定位到某条父评论的“定向回复”。
const { withPage, withReadPage } = require('../../lib/cdp');
const { run, requiredEnv, readText, trustedURL, navigate, choose, button, fillEmpty, until } = require('../../lib/ops');
const { writeOnce } = require('../../lib/state');
const { oschinaComments, findOSChinaComment } = require('../../lib/comments');
async function main(args = process.argv.slice(2)) {
  const url = trustedURL(args[0], ['my.oschina.net'], /^\/(?:u\/\d+|[^/]+)\/blog\/\d+\/?$/).href;
  const text = await readText(args[1]);
  const author = requiredEnv('OSCHINA_UID', /^\d+$/);
  return writeOnce({ kind: 'oschina.comment', author, url, text }, ({ submit }) => withPage(async page => {
    await navigate(page, url, ['my.oschina.net']);
    const editor = await choose(page, [page.getByPlaceholder(/发布评论/)], '文章评论输入框');
    const previousIds = new Set((await oschinaComments(page)).map(row => row.id));
    await fillEmpty(editor, text, { keyboard: true });
    const publish = await button(page, /^发\s*布$/);
    await submit(() => publish.click()); // locator 自动滚动；禁止使用旧视口坐标。
    return withReadPage(page.context(), async readPage => {
      const match = await until(async () => {
        await navigate(readPage, url, ['my.oschina.net']);
        return findOSChinaComment(await oschinaComments(readPage), { previousIds, author, text });
      }, { timeout: 30000, interval: 2000, label: '未核验到新评论 ID、作者和正文；评论总数不能证明回复成功' });
      return { status: 'verified', articleUrl: url, evidence: { kind: 'independent_comment_readback', commentId: match.id, authorMatched: true, bodyMatched: true } };
    });
  }, { keepOnError: true }));
}
if (require.main === module) run(main);
module.exports = main;
