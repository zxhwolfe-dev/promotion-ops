'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { probeDOM, probeConfig, inspectPage } = require('../scripts/ops/probe-article');
const { articleDOMProof } = require('../lib/articles');
const { readMetric } = require('../lib/metrics');
const { collectTarget } = require('../scripts/stats/daily-snapshot');
const executable = process.env.PROMO_TEST_BROWSER;
const requireBrowser = process.env.PROMO_REQUIRE_BROWSER_TESTS === '1';
const first = 'First full paragraph has enough text to verify';
const last = 'Last full paragraph has enough text to verify';
const url = 'https://cloud.tencent.com/developer/article/123';
const config = () => probeConfig(['tencent', url, first, last, '["article"]']);
test('session4 isolated DOM and source-binding contracts', { skip: !executable && !requireBrowser, timeout: 45000 }, async t => {
  assert.ok(executable, 'CI requires an isolated test browser');
  const browser = await chromium.launch({ executablePath: executable, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await t.test('publishing proof rejects empty and missing needles', async () => {
      await page.setContent(`<h1>Title</h1><article>${first}</article>`);
      for (const needles of [[first, ''], [first, ' '], [first, undefined], []]) {
        assert.equal(await page.evaluate(articleDOMProof, { title: 'Title', needles }), false);
      }
    });
    await t.test('probe numeric IDs and punctuation classes round-trip to the exact selector counted', async () => {
      await page.setContent(`<h1>Title</h1><div id="19759257"><p class="body:copy">${first} ${last}</p></div><div>not article</div>`);
      const data = await page.evaluate(probeDOM, { ...config(), selectors: [] });
      assert.ok(data.ancestors.some(row => row.selector.includes('19759257') || row.selector.includes('9759257')));
      assert.ok(data.ancestors.some(row => row.selector.includes('body\\:copy')));
      assert.equal(data.containers.find(row => row.selector.includes('9759257')).candidateOnly, true);
      for (const row of data.ancestors) {
        assert.equal(row.error, undefined);
        assert.equal(await page.locator(row.selector).count(), row.totalCount);
      }
    });
    await t.test('probe discovery cannot substitute for publishing proof of a comment-contaminated container', async () => {
      await page.setContent(`<h1>Title</h1><article>${first}<section class="comments">${last}</section></article>`);
      const data = await page.evaluate(probeDOM, config());
      assert.equal(data.containers.find(row => row.selector === 'article').visibleCount, 1);
      assert.equal(await page.evaluate(articleDOMProof, { title: 'Title', needles: [first, last], bodySelectors: ['article'] }), false);
    });
    await t.test('metric polling waits through visible placeholder and aria-busy zero', async () => {
      await page.setContent('<div aria-busy="true"><span id="reads">0</span></div>');
      await page.evaluate(() => setTimeout(() => {
        document.querySelector('#reads').textContent = '阅读 523';
        document.querySelector('[aria-busy]').setAttribute('aria-busy', 'false');
      }, 80));
      assert.equal((await readMetric(page, '#reads', 1000, { metric: 'reads' })).value, 523);
    });
    await t.test('wrong semantic labels and duplicate counters never become numeric success', async () => {
      await page.setContent('<span id="counter">评论 2</span><span class="likes">0</span><span class="likes">0</span>');
      assert.equal((await readMetric(page, '#counter', 0, { metric: 'reads' })).value, null);
      assert.equal((await readMetric(page, '.likes', 0)).reason, 'selector_ambiguous');
      assert.equal((await readMetric(page, '.unconfigured', 0)).value, null);
    });
    // All URL navigations below are fulfilled locally. No live community/account access.
    let html = `<h1>Title</h1><article>${first}<p>${last}</p></article>`;
    await context.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
    let navigationBlocked = false;
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 }); }
    catch (error) {
      if (!String(error).includes('ERR_BLOCKED_BY_ADMINISTRATOR') || requireBrowser) throw error;
      navigationBlocked = true;
    }
    const navigationTest = (name, fn) => t.test(name, { skip: navigationBlocked ? 'environment navigation policy; strict CI may not skip' : false }, fn);
    await navigationTest('probe uses the same complete publishing proof and returns partial for comments or missing h1', async () => {
      for (const fixture of [
        `<h1>Title</h1><article>${first}<section class="comments">${last}</section></article>`,
        `<article>${first} ${last}</article>`,
      ]) {
        html = fixture; await page.goto(url);
        const result = await inspectPage(page, config());
        assert.equal(result.status, 'partial'); assert.ok(result.containers.every(row => !row.isBody));
      }
      html = `<h1>Title</h1><article>${first}<p>${last}</p></article>`; await page.goto(url);
      assert.equal((await inspectPage(page, config())).status, 'ok');
    });
    await navigationTest('probe rejects an immediate redirect to another article', async () => {
      await page.goto(url.replace('/123', '/456'));
      await assert.rejects(inspectPage(page, config()), { code: 'TARGET_CHANGED' });
    });
    await navigationTest('snapshot discards a real History API target transition during delayed metric loading', async () => {
      html = `<h1>Title</h1><div id="reads">loading</div><div id="likes">loading</div><div id="comments">loading</div>
      <script>setTimeout(()=>{history.replaceState({},'', '/developer/article/456');
      document.querySelector('#reads').textContent='999';document.querySelector('#likes').textContent='8';document.querySelector('#comments').textContent='7';},80)</script>`;
      const row = await collectTarget(page, { id: 'A', kind: 'tencent', url,
        metricSelectors: { reads: '#reads', likes: '#likes', comments: '#comments' } }, { timeout: 1000 });
      assert.equal(row.status, 'unavailable'); assert.equal(row.error.code, 'TARGET_CHANGED');
      assert.ok(Object.values(row.metrics).every(row => row.value === null));
    });
  } finally { await browser.close(); }
});
