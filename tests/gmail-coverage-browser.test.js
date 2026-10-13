'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { collectMailboxPages } = require('../lib/gmail-pagination');
const executable = process.env.PROMO_TEST_BROWSER;
test('Gmail never overstates coverage when a page is truncated or has unstable identities', { skip: !executable, timeout: 30000 }, async t => {
  const browser = await chromium.launch({ executablePath: executable, headless: true, args: ['--no-sandbox', '--disable-background-networking'] });
  const page = await browser.newPage();
  const row = id => `<tr class="zA" ${id ? `data-legacy-thread-id="${id}"` : ''}><td class="bog">Title</td></tr>`;
  const html = (ids, disabled = true) => `<table>${ids.map(row).join('')}</table><button aria-disabled="${disabled}">Older</button>`;
  try {
    await t.test('observed Chinese next-results control confirms a disabled final page', async () => {
      await page.setContent(html(['cn-a', 'cn-b']).replace('Older', '下一页结果'));
      const result = await collectMailboxPages(page, () => true, 50);
      assert.equal(result.complete, true); assert.equal(result.coverage, 'all_matching_rows');
      assert.deepEqual(result.rows.map(row => row.id), ['cn-a', 'cn-b']);
    });
    await t.test('an unrecognized pagination control still reports partial', async () => {
      await page.setContent(html(['unknown-a']).replace('Older', '未知按钮'));
      const result = await collectMailboxPages(page, () => true, 50);
      assert.equal(result.complete, false); assert.equal(result.paginationError, 'pagination_control_unverified');
    });
    await t.test('51 rows on disabled final page with limit50 is partial', async () => {
      await page.setContent(html(Array.from({ length: 51 }, (_, i) => 't' + i)));
      const result = await collectMailboxPages(page, () => true, 50);
      assert.equal(result.returned, 50); assert.equal(result.complete, false); assert.equal(result.paginationError, 'row_limit');
    });
    await t.test('two40row pages cannot overrun global limit50 or claim complete', async () => {
      await page.setContent(html(Array.from({ length: 40 }, (_, i) => 'a' + i), false));
      await page.evaluate(next => { document.querySelector('button').onclick = () => { document.body.innerHTML = next; }; }, html(Array.from({ length: 40 }, (_, i) => 'b' + i)));
      const result = await collectMailboxPages(page, () => true, 50);
      assert.equal(result.returned, 50); assert.equal(result.complete, false); assert.equal(result.coverage, 'partial_pages');
    });
    await t.test('missing and duplicate thread IDs never produce complete', async () => {
      for (const ids of [['a', null], ['a', 'a']]) {
        await page.setContent(html(ids));
        assert.equal((await collectMailboxPages(page, () => true, 50)).complete, false);
      }
    });
    await t.test('two complete pages are collected without loss', async () => {
      await page.setContent(html(['a', 'b'], false));
      await page.evaluate(next => { document.querySelector('button').onclick = () => { document.body.innerHTML = next; }; }, html(['c']));
      const result = await collectMailboxPages(page, () => true, 50);
      assert.equal(result.complete, true); assert.deepEqual(result.rows.map(row => row.id), ['a', 'b', 'c']);
    });
  } finally { await browser.close(); }
});
