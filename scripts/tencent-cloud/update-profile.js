'use strict';
const { withPage, withReadPage } = require('../../lib/cdp');
const { run, requiredEnv, trustedURL, navigate, choose, button, until, OpsError } = require('../../lib/ops');
const { writeOnce } = require('../../lib/state');
async function fields(page) {
  return {
    nick: await choose(page, [page.getByPlaceholder('当前昵称', { exact: true }), page.getByRole('textbox', { name: /昵称/ })], '昵称'),
    bio: await choose(page, [page.getByPlaceholder('个人简介', { exact: true })], '个人简介'),
    site: await choose(page, [page.getByPlaceholder('www.xxx.com', { exact: true })], '个人网站'),
  };
}
async function main(args = process.argv.slice(2)) {
  const [nick, bio, site] = args;
  if (args.length !== 3 || !nick?.trim() || typeof bio !== 'string' || [...bio].length > 50) throw new OpsError('INVALID_PROFILE', 'usage: update-profile.js <nickname> <bio(<=50字符，可空)> <httpsWebsite>');
  let website;
  try { website = new URL(site); } catch { throw new OpsError('INVALID_WEBSITE', '网站 URL 无效'); }
  trustedURL(website.href, [website.hostname]);
  const account = requiredEnv('TENCENT_UID', /^\d+$/);
  const changeId = requiredEnv('PROFILE_CHANGE_ID', /^[A-Za-z0-9_-]{1,80}$/);
  const url = `https://cloud.tencent.com/developer/user/${account}/profile`;
  return writeOnce({ kind: 'tencent.profile', changeId, account, nick, bio, site }, ({ submit }) => withPage(async page => {
    await navigate(page, url, ['cloud.tencent.com']);
    if (new URL(page.url()).pathname !== new URL(url).pathname) throw new OpsError('ACCOUNT_MISMATCH', '资料页面跳转到了其他账号或路径', 3);
    const inputs = await fields(page);
    await inputs.nick.fill(nick); await inputs.bio.fill(bio); await inputs.site.fill(site);
    const confirm = await button(page, '确认提交');
    await submit(() => confirm.click());
    return withReadPage(page.context(), async readPage => {
      await until(async () => {
        await navigate(readPage, url, ['cloud.tencent.com']);
        if (new URL(readPage.url()).pathname !== new URL(url).pathname) throw new OpsError('ACCOUNT_MISMATCH', '资料回读跳转到了其他账号或路径', 3);
        const saved = await fields(readPage);
        return (await saved.nick.inputValue()) === nick && (await saved.bio.inputValue()) === bio && (await saved.site.inputValue()) === site;
      }, { timeout: 30000, interval: 2000, label: '资料回读不一致，可能待审核；不能宣称公开资料已生效' });
      return { status: 'verified', evidence: { kind: 'independent_profile_readback', moderationApproved: 'not_verified' } };
    });
  }, { keepOnError: true }));
}
if (require.main === module) run(main);
module.exports = main;
