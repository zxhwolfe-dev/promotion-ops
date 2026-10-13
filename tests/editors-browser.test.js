'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { fillMonaco, chooseEditor, editorSelectors, editorProbeDOM } = require('../lib/editors');
const executable = process.env.PROMO_TEST_BROWSER;
test('editor configuration rejects broad and malformed selectors before a browser connection', () => {
  for (const raw of ['null', '{bad', '{"aliyun":["body"]}', '{"aliyun":[]}']) {
    process.env.PROMO_EDITOR_SELECTORS = raw;
    assert.throws(() => editorSelectors('aliyun'), { code: 'INVALID_EDITOR_SELECTORS' });
  }
  delete process.env.PROMO_EDITOR_SELECTORS;
});
test('new editor adapters protect drafts and fill only verified empty models', { skip: !executable, timeout: 30000 }, async t => {
  const browser = await chromium.launch({ executablePath: executable, headless: true, args: ['--no-sandbox', '--disable-background-networking'] });
  const page = await browser.newPage();
  try {
    await t.test('Monaco invisible placeholder is replaced but meaningful draft is preserved', async () => {
      await page.setContent('<textarea></textarea>');
      await page.evaluate(() => { window.value = '\u200b'; window.monaco = { editor: { getModels: () => [{ getValue: () => window.value, setValue: value => { window.value = value; } }] } }; });
      await fillMonaco(page, 'New article\nsecond line');
      assert.equal(await page.evaluate(() => window.value), 'New article\nsecond line');
      await assert.rejects(fillMonaco(page, 'overwrite'), { code: 'EXISTING_DRAFT' });
      assert.equal(await page.evaluate(() => window.value), 'New article\nsecond line');
      await page.evaluate(() => { window.monaco.editor.getModels = () => []; });
      await assert.rejects(fillMonaco(page, 'new'), { code: 'MONACO_MODEL_AMBIGUOUS' });
    });
    await t.test('configured Aliyun editor works without guessing changed DOM and rejects ambiguity', async () => {
      process.env.PROMO_EDITOR_SELECTORS = '{"aliyun":["#new-editor"]}';
      await page.setContent('<textarea id="new-editor"></textarea>');
      assert.ok(await chooseEditor(page, 'aliyun'));
      const probe = await page.evaluate(editorProbeDOM);
      assert.equal(probe[0].contentLength, 0); assert.equal(probe[0].candidateOnly, true);
      process.env.PROMO_EDITOR_SELECTORS = '{"aliyun":["textarea"]}';
      await page.setContent('<textarea></textarea><textarea></textarea>');
      await assert.rejects(chooseEditor(page, 'aliyun'), { code: 'AMBIGUOUS_SELECTOR' });
      process.env.PROMO_EDITOR_SELECTORS = '{"aliyun":["#new-editor"]}';
      await page.setContent('<div id="new-editor">not editable</div>');
      await assert.rejects(chooseEditor(page, 'aliyun'), { code: 'EDITOR_NOT_EDITABLE' });
    });
  } finally { delete process.env.PROMO_EDITOR_SELECTORS; await browser.close(); }
});
