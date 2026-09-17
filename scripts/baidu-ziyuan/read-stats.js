'use strict';
const { withPage } = require('../../lib/cdp');
const { run, navigate, until, trustedURL } = require('../../lib/ops');
async function main() {
  const site = new URL(process.env.BAIDU_SITE || 'https://aiworkstation.cn');
  trustedURL(site.href, [site.hostname]);
  return withPage(async page => {
    await navigate(page, 'https://ziyuan.baidu.com/dashboard/index?site=' + encodeURIComponent(site.origin + '/'), ['ziyuan.baidu.com']);
    const excerpt = await until(async () => {
      const text = await page.locator('body').innerText();
      return /索引量|普通收录|数据看板/.test(text) && text.replace(/\n{2,}/g, '\n').slice(0, 1200);
    }, { label: '百度控制台未加载或登录已失效' });
    return { status: 'unavailable', site: site.origin, collectedAt: new Date().toISOString(), metrics: null,
      reason: 'structured_metrics_adapter_not_configured', excerpt, note: '页面摘要不是已经解析的索引量或关键词统计' };
  });
}
if (require.main === module) run(main);
module.exports = main;
