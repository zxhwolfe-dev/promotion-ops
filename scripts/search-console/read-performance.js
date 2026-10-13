'use strict';
// GSC 结构化指标：当前属性 + 效果报告首页数据。只读取 UI 实际显示的日期窗口并如实记录，
// 不改窗口、不翻页（coverage 标 first_page）。表头不匹配/数值不可解析 → 对应字段 null + 原因。
const { withPage } = require('../../lib/cdp');
const { extractPerformanceDOM } = require('../../lib/gsc-performance');
const { run, navigate, choose, until, OpsError } = require('../../lib/ops');

async function main() {
  const property = process.env.GSC_PROPERTY || 'sc-domain:aiworkstation.cn';
  return withPage(async page => {
    await navigate(page, 'https://search.google.com/search-console?resource_id=' + encodeURIComponent(property), ['search.google.com']);
    await page.waitForTimeout(5500); // Read the property navigation before opening its report.
    const performance = await choose(page, [page.getByRole('link', { name: /^(效果|Performance)$/ }), page.getByText('效果', { exact: true })], '效果报告入口');
    await performance.click();
    await until(async () => /热门查询|Top queries/.test(await page.locator('body').innerText()), { label: '未找到查询报告，可能页面改版或登录失效', code: 'SELECTOR_MISSING', exitCode: 2 });

    await page.waitForTimeout(5500); // Read the loaded report before taking a snapshot.
    const extracted = await page.evaluate(extractPerformanceDOM);

    if (!extracted.queries.length && !Object.keys(extracted.totals).length) {
      throw new OpsError('GSC_STRUCTURE_UNRECOGNIZED', '效果报告结构无法解析；不导出半成品数据', 2);
    }
    return { status: 'ok', property, collectedAt: new Date().toISOString(),
      dateWindow: extracted.dateWindow || 'unreported_by_ui', totals: extracted.totals,
      dataFreshness: extracted.dataFreshness, chartDataRange: extracted.chartDataRange,
      queries: extracted.queries, tableMeta: extracted.tableMeta, coverage: 'first_page_only',
      fieldSources: extracted.fieldSources, note: 'UI 首屏数据；未翻页、未修改日期窗口；数值为界面显示文本' };
  });
}
if (require.main === module) run(main);
module.exports = main;
