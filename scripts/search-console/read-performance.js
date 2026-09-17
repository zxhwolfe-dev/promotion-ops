'use strict';
const { withPage } = require('../../lib/cdp');
const { run, navigate, choose, until } = require('../../lib/ops');
async function main() {
  const property = process.env.GSC_PROPERTY || 'sc-domain:aiworkstation.cn';
  return withPage(async page => {
    await navigate(page, 'https://search.google.com/search-console?resource_id=' + encodeURIComponent(property), ['search.google.com']);
    const performance = await choose(page, [page.getByRole('link', { name: /^(效果|Performance)$/ }), page.getByText('效果', { exact: true })], '效果报告入口');
    await performance.click();
    const excerpt = await until(async () => {
      const text = await page.locator('body').innerText();
      return (text.match(/(?:热门查询|Top queries)[\s\S]{0,1200}/) || [])[0];
    }, { label: '未找到查询报告，可能页面改版或登录失效' });
    return { status: 'unavailable', property, collectedAt: new Date().toISOString(), metrics: null,
      reason: 'structured_metrics_adapter_not_configured', excerpt, note: '未解析日期范围和数值口径，不能直接合入数据看板' };
  });
}
if (require.main === module) run(main);
module.exports = main;
