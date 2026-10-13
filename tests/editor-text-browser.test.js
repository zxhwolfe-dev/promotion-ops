'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { insertEditorText } = require('../lib/editor-text');
test('Markdown insertion preserves section boundaries and rejects editors that discard Enter', { skip: !process.env.PROMO_TEST_BROWSER }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.PROMO_TEST_BROWSER, headless: true, args: ['--no-sandbox', '--disable-background-networking'] });
  const page = await browser.newPage();
  try {
    const text = 'Intro.\n\n## Heading\n\nParagraph.';
    await page.setContent('<pre contenteditable="true"></pre>');
    await insertEditorText(page, page.locator('pre'), text);
    assert.match(await page.locator('pre').innerText(), /## Heading\n/);
    await page.setContent('<textarea></textarea>');
    await insertEditorText(page, page.locator('textarea'), text);
    assert.equal(await page.locator('textarea').inputValue(), text);
    await page.setContent('<pre contenteditable="true"></pre>');
    await page.locator('pre').evaluate(e => e.addEventListener('keydown', ev => { if (ev.key === 'Enter') ev.preventDefault(); }));
    await assert.rejects(() => insertEditorText(page, page.locator('pre'), text), { code: 'FILL_MISMATCH' });
  } finally { await browser.close(); }
});
