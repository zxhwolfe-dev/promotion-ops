'use strict';
// Passed to page.evaluate; only visible UI and explicit ARIA selection prove coverage.
function extractPerformanceDOM() {
      const num = raw => { const m = String(raw ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?%?/); return m ? m[0] : null; };
      const out = { dateWindow: 'unknown_active_window', dataFreshness: null, totals: {}, queries: [], tableMeta: null,
        fieldSources: { queries: 'performance_plain_table_first_page', totals: 'summary_label_value_pairs', dateWindow: 'range_controls_aria_selected_state' } };
      const text = document.body.innerText;
      // 数据新鲜度：界面自报的上次更新时间
      out.dataFreshness = (text.match(/上次更新[^\n]{0,25}/) || [''])[0].replace(/\s+/g, ' ').trim() || null;
      // 日期窗口只接受当前可见控件的显式ARIA选中态；无法确认时保持unknown。
      for (const btn of document.querySelectorAll('button, [role=radio], [role=tab]')) {
        if (!btn.getBoundingClientRect().width || !btn.getBoundingClientRect().height) continue;
        const label = (btn.innerText || '').trim();
        if (!/^(?:24 小时|7 天|28 天|3 个月|16 个月|12 个月)$/.test(label)) continue;
        const pressed = ['aria-pressed', 'aria-checked', 'aria-selected'].some(attr => btn.getAttribute(attr) === 'true');
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
        if (!table.getBoundingClientRect().width || !table.getBoundingClientRect().height) continue;
        const headerCells = [...table.querySelectorAll('th')].map(th => (th.innerText || '').trim());
        if (!headerCells.some(h => /查询|query/i.test(h))) continue;
        const col = name => headerCells.findIndex(h => h.includes(name));
        const qi = col('查询') >= 0 ? col('查询') : 0;
        const ci = col('点击'), ii = col('展示');
        for (const tr of table.querySelectorAll('tr')) {
          if (!tr.getBoundingClientRect().width || !tr.getBoundingClientRect().height) continue;
          const tds = [...tr.querySelectorAll('td')].map(td => (td.innerText || '').trim());
          if (tds.length < 2 || !tds[qi]) continue;
          const entry = { query: tds[qi].slice(0, 100) };
          if (ci >= 0 && tds[ci]) entry.clicks = num(tds[ci]);
          if (ii >= 0 && tds[ii]) entry.impressions = num(tds[ii]);
          if (entry.clicks == null && entry.impressions == null) continue;
          out.queries.push(entry);
          if (out.queries.length >= 25) break;
        }
        out.tableMeta = (text.match(/第\s*\d+\s*[-–]\d+\s*行[^\n]{0,25}/) || (text.match(/共\s*\d+\s*行/) || ['']))[0] || null;
        break;
      }
      out.chartDataRange = (text.match(/图表，包含从[^\n]+/) || [null])[0];
      return out;
}
module.exports = { extractPerformanceDOM };
