'use strict';
// GSC 结构化指标：当前属性 + 效果报告首页数据。只读取 UI 实际显示的日期窗口并如实记录，
// 不改窗口、不翻页（coverage 标 first_page）。表头不匹配/数值不可解析 → 对应字段 null + 原因。
const { withPage } = require('../../lib/cdp');
const { run, navigate, choose, until, OpsError } = require('../../lib/ops');

async function main() {
  const property = process.env.GSC_PROPERTY || 'sc-domain:aiworkstation.cn';
  return withPage(async page => {
    await navigate(page, 'https://search.google.com/search-console?resource_id=' + encodeURIComponent(property), ['search.google.com']);
    const performance = await choose(page, [page.getByRole('link', { name: /^(效果|Performance)$/ }), page.getByText('效果', { exact: true })], '效果报告入口');
    await performance.click();
    await until(async () => /热门查询|Top queries/.test(await page.locator('body').innerText()), { label: '未找到查询报告，可能页面改版或登录失效', code: 'SELECTOR_MISSING', exitCode: 2 });

    const extracted = await page.evaluate(() => {
      const num = raw => { const m = String(raw ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?%?/); return m ? m[0] : null; };
      const out = { dateWindow: 'unknown_active_window', dataFreshness: null, totals: {}, queries: [], tableMeta: null,
        fieldSources: { queries: 'performance_plain_table_first_page', totals: 'summary_label_value_pairs', dateWindow: 'range_buttons_pressed_state' } };
      const text = document.body.innerText;
      // 数据新鲜度：界面自报的上次更新时间
      out.dataFreshness = (text.match(/上次更新[^\n]{0,25}/) || [''])[0].replace(/\s+/g, ' ').trim() || null;
      // 日期窗口：24小时/7天/28天/3个月 按钮的按下态（aria-pressed 或选中类）；判不出就如实写 unknown
      for (const btn of document.querySelectorAll('button')) {
        const label = (btn.textContent || '').trim();
        if (!/^(?:24 小时|7 天|28 天|3 个月|16 个月|12 个月)$/.test(label)) continue;
        const pressed = btn.getAttribute('aria-pressed') === 'true' || /selected|active/i.test(btn.className || '') ||
          (btn.closest('[role="group"], [class*="tab"]') && getComputedStyle(btn).fontWeight >= 500 && false);
        if (pressed) out.dateWindow = label;
      }
      // 汇总卡：标签行 + 相邻数值行（“总点击次数\n14”）
      for (const label of ['总点击次数', '总曝光次数', '平均点击率', '平均排名', '总点击', '总展示']) {
        const idx = text.indexOf(label);
        if (idx < 0 || out.totals[label]) continue;
        const value = num(text.slice(idx + label.length, idx + label.length + 12).split('\n').find(l => l.trim()));
        if (value) out.totals[label] = value;
      }
      // 热门查询表：包含“查询”表头的普通 table
      for (const table of document.querySelectorAll('table')) {
        const headerCells = [...table.querySelectorAll('th')].map(th => (th.innerText || '').trim());
        if (!headerCells.some(h => /查询|query/i.test(h))) continue;
        const col = name => headerCells.findIndex(h => h.includes(name));
        const qi = col('查询') >= 0 ? col('查询') : 0;
        const ci = col('点击'), ii = col('展示');
        for (const tr of table.querySelectorAll('tr')) {
          const tds = [...tr.querySelectorAll('td')].map(td => (td.innerText || '').trim());
          if (tds.length < 2 || !tds[qi]) continue;
          const entry = { query: tds[qi].slice(0, 100) };
          if (ci >= 0 && tds[ci]) entry.clicks = num(tds[ci]);
          if (ii >= 0 && tds[ii]) entry.impressions = num(tds[ii]);
          if (entry.clicks === null && entry.impressions === null) continue;
          out.queries.push(entry);
          if (out.queries.length >= 25) break;
        }
        out.tableMeta = (text.match(/第\s*\d+\s*[-–]\d+\s*行[^\n]{0,25}/) || (text.match(/共\s*\d+\s*行/) || ['']))[0] || null;
        break;
      }
      return out;
    });

    if (!extracted.queries.length && !Object.keys(extracted.totals).length) {
      throw new OpsError('GSC_STRUCTURE_UNRECOGNIZED', '效果报告结构无法解析；不导出半成品数据', 2);
    }
    return { status: 'ok', property, collectedAt: new Date().toISOString(),
      dateWindow: extracted.dateWindow || 'unreported_by_ui', totals: extracted.totals,
      queries: extracted.queries, tableMeta: extracted.tableMeta, coverage: 'first_page_only',
      fieldSources: extracted.fieldSources, note: 'UI 首屏数据；未翻页、未修改日期窗口；数值为界面显示文本' };
  });
}
if (require.main === module) run(main);
module.exports = main;
