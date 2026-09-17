'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright-core');
const { captureResponseArticleId, verifyArticle } = require('../lib/articles');
const executable = process.env.PROMO_TEST_BROWSER;
const requireBrowser = process.env.PROMO_REQUIRE_BROWSER_TESTS === '1';
const first = 'First full paragraph has enough text to verify';
const last = 'Last full paragraph has enough text to verify';
const title = 'Verified title for correlation test';

test('session5 response-ID correlation contracts', { skip: !executable && !requireBrowser, timeout: 60000 }, async t => {
  assert.ok(executable, 'CI requires an isolated test browser');
  const server = await new Promise(resolve => {
    const s = http.createServer((req, res) => {
      if (req.url.startsWith('/article/')) {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<h1>${title}</h1><article>${first}<p>${last}</p></article>`);
        return;
      }
      res.writeHead(404); res.end();
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: executable, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
  try {
    const context = await browser.newContext();
    // Local fulfill only: no real platform traffic. Rewrites map the trusted host to the local server.
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'cloud.tencent.com') {
        return route.fulfill({ contentType: 'text/html', body: `<h1>${title}</h1><article>${first}<p>${last}</p></article>` });
      }
      return route.continue();
    });
    const page = await context.newPage();

    await t.test('capture only accepts the verified CreateArticle shape from a real click', async () => {
      const get = captureResponseArticleId(page, 'tencent');
      await page.route('**/column/article?action=CreateArticle', route => route.fulfill({ json: { code: 0, msg: 'ok', data: { articleId: 2745764 } } }));
      await page.evaluate(() => fetch('https://cloud.tencent.com/developer/services/ajax/column/article?action=CreateArticle', { method: 'POST' }).catch(() => {}));
      await page.waitForTimeout(300);
      assert.equal(get(), '2745764');
    });
    await t.test('capture ignores business-failure responses', async () => {
      const get = captureResponseArticleId(page, 'tencent');
      await page.route('**/column/article?action=CreateArticle', route => route.fulfill({ json: { code: -1, msg: 'rejected', data: { articleId: 9 } } }));
      await page.evaluate(() => fetch('https://cloud.tencent.com/developer/services/ajax/column/article?action=CreateArticle', { method: 'POST' }).catch(() => {}));
      await page.waitForTimeout(300);
      assert.equal(get(), null); // 未捕获：验证将标 absent，而不是拿 200 当成功
    });
    await t.test('mismatched response id fails verification before readback success', async () => {
      await page.goto('https://cloud.tencent.com/developer/article/2745764');
      await assert.rejects(
        verifyArticle(page, 'tencent', title, `${first}\n${last}`, { expectedArticleId: '999999' }),
        error => error instanceof Error && error.code === 'ARTICLE_ID_MISMATCH' && error.details.urlArticleId === '2745764',
      );
    });
    await t.test('matching response id produces correlated evidence', async () => {
      await page.goto('https://cloud.tencent.com/developer/article/2745764');
      const result = await verifyArticle(page, 'tencent', title, `${first}\n${last}`, { expectedArticleId: '2745764' });
      assert.equal(result.status, 'verified');
      assert.equal(result.evidence.responseIdCorrelation, 'matched');
      assert.equal(result.evidence.responseArticleId, '2745764');
      assert.equal(result.evidence.urlArticleId, '2745764');
    });
    await t.test('absent correlation is stated, never assumed', async () => {
      await page.goto('https://cloud.tencent.com/developer/article/2745764');
      const result = await verifyArticle(page, 'tencent', title, `${first}\n${last}`);
      assert.equal(result.evidence.responseIdCorrelation, 'absent');
    });
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
});

test('session5 Gmail bounded pagination and merged-thread readback', { skip: !executable && !requireBrowser, timeout: 60000 }, async t => {
  assert.ok(executable, 'CI requires an isolated test browser');
  const browser = await chromium.launch({ executablePath: executable, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const query = 'in:sent to:reader@example.test newer_than:1d';
    const subject = 'Fixture subject';
    const sameMessage = `<h2 class="hP">${subject}</h2><div class="adn"><span class="g2" email="reader@example.test"></span><div class="a3s">Fixture body</div></div>`;
    const row = (id, subj) => `<tr class="zA" data-legacy-thread-id="${id}"><td class="bog">${subj}</td></tr>`;
    const app = (body, script = '', disabled = false) => `<!doctype html><input name="q"><table>${body}</table><button id="older" aria-disabled="${disabled}">Older</button>${script}`;

    await t.test('pagination walks pages until Older is disabled and reports paged_to_end', async () => {
      await context.route('https://mail.google.com/**', route => route.fulfill({ contentType: 'text/html', body: app(row('a1', subject) + row('a2', subject),
        `<script>document.querySelector('input').value=${JSON.stringify(query)};location.hash='search/'+encodeURIComponent(${JSON.stringify(query)});
        document.querySelector('#older').onclick=()=>{document.querySelector('table').innerHTML=${JSON.stringify(row('b1', subject))};document.querySelector('#older').setAttribute('aria-disabled','true');};</script>`) }));
      await page.goto('about:blank'); // 仅 hash 变化不会重载：先离开，避免上一用例 DOM 残留
      await page.goto('https://mail.google.com/mail/u/0/#inbox');
      const gmail = require('../lib/gmail');
      const result = await gmail.searchMailbox(page, query, 50);
      assert.equal(result.status, 'ok');
      assert.equal(result.complete, true);
      assert.equal(result.coverage, 'paged_to_end');
      assert.equal(result.pagesWalked, 2);
      assert.deepEqual(result.rows.map(r => r.id), ['a1', 'a2', 'b1']);
    });
    await t.test('never-ending pagination stays partial with reason', async () => {
      let pageCounter = 0;
      await context.unroute('https://mail.google.com/**');
      await context.route('https://mail.google.com/**', route => {
        pageCounter++;
        route.fulfill({ contentType: 'text/html', body: app(row('p' + pageCounter, subject),
          `<script>document.querySelector('input').value=${JSON.stringify(query)};location.hash='search/'+encodeURIComponent(${JSON.stringify(query)});</script>`) });
      });
      await page.goto('about:blank'); // 仅 hash 变化不会重载：先离开，避免上一用例 DOM 残留
      await page.goto('https://mail.google.com/mail/u/0/#inbox');
      const gmail = require('../lib/gmail');
      const result = await gmail.searchMailbox(page, query, 50, { maxPages: 3 });
      assert.equal(result.status, 'partial');
      assert.equal(result.complete, false);
      assert.equal(result.coverage, 'first_page_only');
      assert.equal(result.rows.length <= 3, true);
    });
    await t.test('merged thread verifies with baseline thread id when no new thread appears', async () => {
      await context.unroute('https://mail.google.com/**');
      await context.route('https://mail.google.com/**', route => route.fulfill({ contentType: 'text/html', body: app(row('base1', subject), 
        `<script>document.querySelector('input').value=${JSON.stringify(query)};location.hash='search/'+encodeURIComponent(${JSON.stringify(query)});
        document.querySelector('tr').onclick=()=>document.body.innerHTML=${JSON.stringify(sameMessage)};</script>`, true) }));
      await page.goto('about:blank'); // 仅 hash 变化不会重载：先离开，避免上一用例 DOM 残留
      await page.goto('https://mail.google.com/mail/u/0/#inbox');
      const { verifySent } = require('../lib/gmail');
      const proof = await verifySent(page, { query, previousIds: new Set(['base1']), recipient: 'reader@example.test', subject, body: 'Fixture body' });
      assert.equal(proof.status, 'verified');
      assert.equal(proof.evidence.kind, 'merged_thread_readback');
      assert.equal(proof.evidence.threadId, 'base1');
      assert.equal(proof.evidence.mergedIntoBaselineThread, true);
    });
    await page.close();
  } finally { await browser.close(); }
});
