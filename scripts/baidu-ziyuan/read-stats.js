'use strict';
// 百度搜索资源平台结构化指标。必须从 dashboard 侧栏进入（工具页直链会报 site is wrong）。
// 需要已登录会话；登录页/未登录 → exit 3。表头不匹配 → 对应块 null + 原因，不导出半成品。
const { withPage } = require('../../lib/cdp');
const { run, navigate, until, OpsError } = require('../../lib/ops');

async function main() {
  const site = new URL(process.env.BAIDU_SITE || 'https://aiworkstation.cn');
  const origin = site.origin;
  return withPage(async page => {
    // 未登录时带 site 参数的 dashboard 会直接 400：先在裸入口确认登录态，再进站点视图
    await navigate(page, 'https://ziyuan.baidu.com/dashboard/index', ['ziyuan.baidu.com']);
    const loggedIn = await page.evaluate(() => {
      const chip = [...document.querySelectorAll('a, span, div')].find(e => e.offsetWidth && (e.textContent || '').trim() === '登录');
      return !chip;
    });
    if (!loggedIn) throw new OpsError('LOGIN_REQUIRED', '百度平台未登录；请在保留标签中人工登录后重跑只读采集', 3);
    await navigate(page, 'https://ziyuan.baidu.com/dashboard/index?site=' + encodeURIComponent(origin + '/'), ['ziyuan.baidu.com']);
    await until(async () => /索引量|数据统计|站点信息/.test(await page.locator('body').innerText()),
      { label: '百度控制台未加载', code: 'SELECTOR_MISSING', exitCode: 2 });
    // 登录墙检测：dashboard 未登录时仍渲染公共框架，但无站点数据；索引量页会要求登录
    const sidebarGo = async label => {
      await page.evaluate(l => {
        const els = [...document.querySelectorAll('a, span, li')];
        const t = els.find(e => (e.textContent || '').trim() === l && (e.offsetWidth || e.offsetHeight));
        if (t) t.click();
      }, label);
      await page.waitForTimeout(9000);
    };

    const parseTablePage = () => page.evaluate(() => {
      
      const text = document.body.innerText;
      if (/请登录|登录后查看/.test(text.slice(0, 2000))) return { loginRequired: true };
      const out = { rows: [], meta: null };
      for (const table of document.querySelectorAll('table')) {
        const headerCells = [...table.querySelectorAll('th')].map(th => (th.innerText || '').trim());
        if (!headerCells.length) continue;
        const hasKeyword = headerCells.some(h => /关键词/.test(h)) || headerCells.some(h => /索引量/.test(h));
        if (!hasKeyword) continue;
        for (const tr of table.querySelectorAll('tr')) {
          const tds = [...tr.querySelectorAll('td')].map(td => (td.innerText || '').trim());
          if (tds.length < 2) continue;
          out.rows.push(tds.slice(0, 6).map(v => v.slice(0, 60)));
          if (out.rows.length >= 20) break;
        }
        out.header = headerCells.slice(0, 6);
        break;
      }
      return out;
    });

    // 索引量
    await sidebarGo('索引量');
    const indexPage = await parseTablePage().catch(error => ({ error: error.message }));
    // 流量与关键词
    await sidebarGo('流量与关键词');
    const keywordPage = await parseTablePage().catch(error => ({ error: error.message }));

    const result = { status: null, site: origin, collectedAt: new Date().toISOString(),
      index: null, keywords: null, fieldSources: { index: 'indexs_table_recent_rows', keywords: 'keywords_table_first_page' } };
    if (indexPage.loginRequired || keywordPage.loginRequired) throw new OpsError('LOGIN_REQUIRED', '百度平台需要登录；请在保留标签中人工登录后重跑只读采集', 3);
    if (indexPage.rows && indexPage.rows.length) result.index = { header: indexPage.header, recent: indexPage.rows };
    else result.index = { unavailable: true, reason: indexPage.error || 'index_table_not_recognized' };
    if (keywordPage.rows && keywordPage.rows.length) result.keywords = { header: keywordPage.header, rows: keywordPage.rows };
    else result.keywords = { unavailable: true, reason: keywordPage.error || 'keywords_table_not_recognized' };
    if (!result.index.recent && !result.keywords.rows) throw new OpsError('BAIDU_STRUCTURE_UNRECOGNIZED', '两页表格都无法解析；不导出半成品数据', 2);
    result.status = result.index.recent && result.keywords.rows ? 'ok' : 'partial';
    return result;
  });
}
if (require.main === module) run(main);
module.exports = main;
