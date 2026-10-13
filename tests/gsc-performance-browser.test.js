'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { extractPerformanceDOM } = require('../lib/gsc-performance');
test('GSC uses selected radio and visible first-page rows, not hidden report data', { skip: !process.env.PROMO_TEST_BROWSER }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.PROMO_TEST_BROWSER, headless: true, args: ['--no-sandbox', '--disable-background-networking'] });
  const page = await browser.newPage();
  try {
    await page.setContent(`<button role="radio" aria-checked="false">28 天</button><button role="radio" aria-checked="true"><span>3 个月</span><span style="visibility:hidden">3 个月</span></button>
      <p>总点击次数<br>20</p><p>总曝光次数<br>998</p><p>上次更新日期：7小时前</p>
      <table><tr><th>热门查询</th><th>点击次数</th><th>展示</th></tr><tr><td>visible query</td><td>1</td><td>8</td></tr><tr style="display:none"><td>hidden query</td><td>9</td><td>100</td></tr></table><p>第 1-10 行，共 78 行</p>`);
    const result = await page.evaluate(extractPerformanceDOM);
    assert.equal(result.dateWindow, '3 个月');
    assert.deepEqual(result.queries, [{ query: 'visible query', clicks: '1', impressions: '8' }]);
    assert.equal(result.totals['总点击次数'], '20'); assert.equal(result.tableMeta, '第 1-10 行，共 78 行');
    assert.equal(result.dataFreshness, '上次更新日期：7小时前');
    await page.setContent('<button class="unselected">3 个月</button>');
    assert.equal((await page.evaluate(extractPerformanceDOM)).dateWindow, 'unknown_active_window');
  } finally { await browser.close(); }
});
