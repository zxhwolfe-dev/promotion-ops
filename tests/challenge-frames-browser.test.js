'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { assertNoChallenge } = require('../lib/ops');
test('passive reCAPTCHA badge does not block; interactive challenges still stop', { skip: !process.env.PROMO_TEST_BROWSER }, async t => {
  const browser = await chromium.launch({ executablePath: process.env.PROMO_TEST_BROWSER, headless: true, args: ['--no-sandbox', '--disable-background-networking'] });
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  const frame = (path = 'anchor', width = 256, height = 60, host = 'www.google.com') => `<iframe title="reCAPTCHA" src="https://${host}/recaptcha/api2/${path}" style="width:${width}px;height:${height}px;border:0"></iframe>`;
  try {
    await t.test('observed branding badge permits normal readback', async () => {
      await page.setContent(`<div class="grecaptcha-badge">${frame()}</div><p>已请求编入索引</p>`);
      await assertNoChallenge(page);
    });
    for (const [name, html] of [
      ['image-selection challenge', frame('bframe', 400, 580)],
      ['checkbox outside passive badge', frame('anchor', 304, 78)],
      ['large interactive frame inside badge', `<div class="grecaptcha-badge">${frame('anchor', 400, 580)}</div>`],
      ['untrusted frame cannot impersonate a badge', `<div class="grecaptcha-badge">${frame('anchor', 256, 60, 'captcha.example.test')}</div>`],
      ['other-platform verification', '<div id="aliyunCaptcha-mask">Complete verification</div>'],
    ]) await t.test(name, async () => { await page.setContent(html); await assert.rejects(assertNoChallenge(page), { code: 'HUMAN_REQUIRED' }); });
    await t.test('hidden challenge is ignored', async () => { await page.setContent('<iframe src="https://captcha.example.test" style="display:none"></iframe>'); await assertNoChallenge(page); });
  } finally { await browser.close(); }
});
