'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { verify } = require('../scripts/youtube/publish-image-prompt');
const { reconcile } = require('../lib/state');
const executable = process.env.PROMO_TEST_BROWSER || chromium.executablePath();
const browserRequired = process.env.PROMO_REQUIRE_BROWSER_TESTS === '1';

test('permalink readback scrolls the actual attachment and waits for lazy decoding, ignoring hidden placeholders',
  { skip: !browserRequired && !fs.existsSync(executable) }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-lazy-fixture-'));
    const browser = await chromium.launch({ executablePath: executable, headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
      const url = 'https://www.youtube.com/post/Ug-fixture';
      const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="478"><rect width="640" height="478" fill="green"/></svg>').toString('base64');
      await context.route('**/*', route => route.request().url() === url ? route.fulfill({ contentType: 'text/html', body: `
        <ytd-backstage-post-renderer style="display:block">
        <a href="https://www.youtube.com/@useaistation">Owner</a><p>Fixture title</p><p>Complete original prompt.</p>
        <div style="height:1800px"></div><ytd-backstage-image-renderer style="display:block;width:640px;height:478px">
        <img id="real" width="640" height="478"></ytd-backstage-image-renderer><img hidden></ytd-backstage-post-renderer>
        <script>new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))setTimeout(()=>document.querySelector('#real').src=${JSON.stringify(svg)},150)}).observe(document.querySelector('ytd-backstage-image-renderer'));</script>` }) : route.abort());
      const result = await verify(context, { title: 'Fixture title', promptParts: ['Complete original prompt.'],
        assets: [{ width: 1200, height: 896 }], evidenceDirectory: dir, origin: 'gallery_example_not_current_generation' }, url);
      assert.equal(result.status, 'verified');
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'permalink.json'))).images.length, 1);
      assert.equal(context.pages().length, 0);
    } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });
test('local reconciliation accepts independently checked YouTube evidence without publishing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-reconcile-')), prior = process.env.PROMO_STATE_DIR;
  process.env.PROMO_STATE_DIR = dir;
  try {
    fs.mkdirSync(path.join(dir, 'operations'));
    const id = 'a'.repeat(64), file = path.join(dir, 'operations', id + '.json');
    fs.writeFileSync(file, JSON.stringify({ operationId: id, kind: 'youtube.image-prompt', status: 'unknown' }));
    const result = await reconcile(id, 'verified', 'https://www.youtube.com/post/Ug-fixture', true);
    assert.equal(result.state, 'verified');
    assert.equal(JSON.parse(fs.readFileSync(file)).reviews[0].previousState, 'unknown');
  } finally {
    if (prior === undefined) delete process.env.PROMO_STATE_DIR; else process.env.PROMO_STATE_DIR = prior;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
