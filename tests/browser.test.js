'use strict';
// Only launches a new isolated test Chrome. Never connects to PROMO_CDP/user accounts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chromium } = require('playwright-core');
const { withPage } = require('../lib/cdp');
const { OpsError, until, choose, assertNoChallenge, fillEmpty } = require('../lib/ops');
const { insertSafeHTML, articleDOMProof, verifyArticle } = require('../lib/articles');
const { readMetric } = require('../lib/metrics');
const { sentDOMProof, verifySent, assertAccount } = require('../lib/gmail');
const executable = process.env.PROMO_TEST_BROWSER;
if (process.env.PROMO_REQUIRE_BROWSER_TESTS === '1' && !executable) throw new Error('CI requires an isolated test browser');
test('isolated Chrome/CDP and DOM contracts', { skip: !executable, timeout: 60000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'promo-browser-test-'));
  process.env.PROMO_STATE_DIR = path.join(dir, 'state');
  const child = spawn(executable, ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
    '--no-first-run', '--no-default-browser-check', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${path.join(dir, 'profile')}`], { stdio: 'ignore' });
  let spawnError; child.once('error', error => { spawnError = error; });
  let browser, second;
  try {
    const port = await until(async () => {
      if (spawnError) throw spawnError;
      try { return (await fs.readFile(path.join(dir, 'profile', 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }, { timeout: 15000, interval: 100 });
    const endpoint = `http://127.0.0.1:${port}`;
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    const marker = await context.newPage();
    await marker.setContent('<title>persistent-test-tab</title>');
    await context.addCookies([{ name: 'fixture', value: 'session-kept', domain: 'example.test', path: '/' }]);
    await t.test('disconnect one CDP client leaves Chrome, pages, cookies and second client alive', async () => {
      second = await chromium.connectOverCDP(endpoint);
      await browser.close(); browser = null;
      assert.equal(child.exitCode, null);
      assert.ok((await Promise.all(second.contexts()[0].pages().map(page => page.title()))).includes('persistent-test-tab'));
      assert.equal((await second.contexts()[0].cookies()).find(cookie => cookie.name === 'fixture').value, 'session-kept');
      browser = await chromium.connectOverCDP(endpoint);
      await second.close(); second = null;
      assert.equal(browser.isConnected(), true);
    });
    const ctx = browser.contexts()[0];
    await t.test('owned successful and failed pages do not accumulate', async () => {
      const before = ctx.pages().length;
      await withPage(async page => { await page.setContent('<h1>fixture</h1>'); }, { endpoint });
      await until(async () => ctx.pages().length === before);
      await assert.rejects(withPage(async () => { throw new Error('fixture failure'); }, { endpoint }), /fixture failure/);
      await until(async () => ctx.pages().length === before);
      assert.equal(child.exitCode, null);
    });
    await t.test('human-intervention page is retained, not its CDP connection', async () => {
      const before = ctx.pages().length;
      await assert.rejects(withPage(async page => { await page.setContent('<h1>manual challenge fixture</h1>'); throw new OpsError('HUMAN_REQUIRED', 'fixture', 3); }, { endpoint }), { code: 'HUMAN_REQUIRED' });
      await until(async () => ctx.pages().length === before + 1);
      const retained = ctx.pages().at(-1); assert.match(await retained.content(), /manual challenge fixture/); await retained.close();
    });
    const page = await ctx.newPage();
    await t.test('strict selector refuses duplicate visible buttons', async () => {
      await page.setContent('<button>确认发布</button><button>确认发布</button>');
      await assert.rejects(choose(page, [page.getByRole('button', { name: '确认发布', exact: true })], 'publish'), { code: 'AMBIGUOUS_SELECTOR' });
      await page.setContent('<button style="display:none">确认发布</button><button>确认发布</button>');
      assert.equal(await (await choose(page, [page.getByRole('button', { name: '确认发布', exact: true })], 'publish')).count(), 1);
    });
    await t.test('hidden captcha is ignored; visible captcha is escalated', async () => {
      await page.setContent('<div id="aliyunCaptcha-mask" style="display:none">fixture</div>'); await assertNoChallenge(page);
      await page.locator('#aliyunCaptcha-mask').evaluate(el => el.style.display = 'block');
      await assert.rejects(assertNoChallenge(page), { code: 'HUMAN_REQUIRED' });
    });
    await t.test('existing drafts are protected, empty fields round-trip', async () => {
      await page.setContent('<textarea>unsaved user work</textarea>');
      await assert.rejects(fillEmpty(page.locator('textarea'), 'new text'), { code: 'EXISTING_DRAFT' });
      assert.equal(await page.locator('textarea').inputValue(), 'unsaved user work');
      await page.locator('textarea').fill(''); await fillEmpty(page.locator('textarea'), '新正文');
      assert.equal(await page.locator('textarea').inputValue(), '新正文');
    });
    await t.test('HTML injection is rejected before authenticated-origin insertion', async () => {
      await page.setContent('<div contenteditable="true"></div>');
      for (const html of ['<img src="https://example.test/x" onerror="window.executed=1">', '<script>window.executed=1</script>', '<a href="javascript:alert(1)">bad</a>', '<iframe src="https://example.test"></iframe>']) {
        await assert.rejects(insertSafeHTML(page, page.locator('[contenteditable]'), html), { code: 'UNSAFE_HTML' });
      }
      assert.equal(await page.evaluate(() => window.executed), undefined);
      assert.equal(await page.locator('[contenteditable]').innerText(), '');
    });
    await t.test('allowlisted HTML round-trips text; partial insertion is rejected', async () => {
      await page.setContent('<div contenteditable="true"></div>');
      assert.equal(await insertSafeHTML(page, page.locator('[contenteditable]'), '<p>First paragraph.</p><p>Second paragraph.</p>'), 'First paragraph.\n\nSecond paragraph.');
      await page.setContent('<div contenteditable="true"></div>');
      await page.evaluate(() => { const original = document.execCommand.bind(document); window.restoreCommand = () => document.execCommand = original;
        document.execCommand = (command, ui) => original(command, ui, '<p>First paragraph.</p>'); });
      try { await assert.rejects(insertSafeHTML(page, page.locator('[contenteditable]'), '<p>First paragraph.</p><p>Second paragraph.</p>'), { code: 'FILL_MISMATCH' }); }
      finally { await page.evaluate(() => window.restoreCommand()); }
    });
    await t.test('metrics never take unrelated body numbers', async () => {
      await page.setContent('<p>2026年示例里有9999阅读量</p><span class="reads">0</span>');
      assert.equal((await readMetric(page, '.reads')).value, 0);
      assert.equal((await readMetric(page)).value, null);
      await page.setContent('<span class="reads">1</span><span class="reads">2</span>');
      assert.equal((await readMetric(page, '.reads')).value, null);
    });
    await t.test('article DOM proof excludes inputs and requires exact title plus both samples', async () => {
      const expected = { title: 'Expected title', needles: ['First exact sample', 'Last exact sample'] };
      await page.setContent('<h1>Expected title</h1><article><p>First exact sample</p><p>Last exact sample</p></article>');
      assert.equal(await page.evaluate(articleDOMProof, expected), true);
      await page.setContent('<h1>Expected title</h1><article><p>First exact sample</p><textarea>Last exact sample</textarea></article>');
      assert.equal(await page.evaluate(articleDOMProof, expected), false);
      await page.setContent('<h1>Other title</h1><p>First exact sample Last exact sample</p>');
      assert.equal(await page.evaluate(articleDOMProof, expected), false);
    });
    await t.test('article proof rejects recommendations, hidden samples, comments and ambiguous scopes', async () => {
      const expected = { title: 'Expected title', needles: ['First exact sample', 'Last exact sample'] };
      for (const body of [
        '<article><p>First exact sample</p></article><aside>Last exact sample</aside>',
        '<article><p>First exact sample</p><p hidden>Last exact sample</p></article>',
        '<article><p>First exact sample</p><section id="comments">Last exact sample</section></article>',
        '<article>First exact sample Last exact sample</article><article>Other article</article>',
        '<p>First exact sample Last exact sample</p>',
      ]) {
        await page.setContent('<h1>Expected title</h1>' + body);
        assert.equal(await page.evaluate(articleDOMProof, expected), false);
      }
      await page.setContent('<h1>Expected title</h1><div id="verified-copy">First exact sample Last exact sample</div>');
      assert.equal(await page.evaluate(articleDOMProof, { ...expected, bodySelectors: ['#verified-copy'] }), true);
      assert.equal(await page.evaluate(articleDOMProof, { ...expected, bodySelectors: ['body'] }), false);
    });
    await t.test('Gmail identity ignores hidden account menus and rejects conflicting visible identities', async () => {
      await page.setContent('<a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account: owner@example.test">Account</a><button data-ogsr-up hidden aria-label="other@example.test">Hidden</button>');
      await assertAccount(page, 'owner@example.test');
      await assert.rejects(assertAccount(page, 'other@example.test'), { code: 'ACCOUNT_UNVERIFIED' });
      await page.locator('button').evaluate(el => el.hidden = false);
      await assert.rejects(assertAccount(page, 'owner@example.test'), { code: 'ACCOUNT_UNVERIFIED' });
    });
    await t.test('Gmail DOM proof does not mix recipient and body across messages', async () => {
      const expected = { subject: 'Subject', recipient: 'reader@example.test', body: 'Exact body' };
      await page.setContent('<h2 class="hP">Subject</h2><div class="adn"><span class="g2" email="reader@example.test"></span><div class="a3s">Exact body</div></div>');
      assert.equal(await page.evaluate(sentDOMProof, expected), true);
      await page.setContent('<h2 class="hP">Subject</h2><div class="adn"><span class="g2" email="reader@example.test"></span><div class="a3s">Other body</div></div><div class="adn"><span class="g2" email="other@example.test"></span><div class="a3s">Exact body</div></div>');
      assert.equal(await page.evaluate(sentDOMProof, expected), false);
    });
    async function fixtureNavigation(subtest, url) {
      try { await page.goto(url); return true; }
      catch (error) {
        if (error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR') && process.env.PROMO_REQUIRE_BROWSER_TESTS !== '1') { subtest.skip('Environment policy blocks even locally routed navigations; DOM/CDP tests still run'); return false; }
        throw error;
      }
    }
    let articleBody = '<h1>Fixture article</h1><article><p>First independently verified paragraph.</p><p>Last independently verified paragraph.</p></article>';
    // All official-looking URLs are fulfilled locally. No platform is contacted.
    await ctx.route('https://cloud.tencent.com/**', route => route.fulfill({ contentType: 'text/html', body: articleBody }));
    await t.test('article requires independent URL/title/body sample readback', async subtest => {
      if (!await fixtureNavigation(subtest, 'https://cloud.tencent.com/developer/article/123')) return;
      const result = await verifyArticle(page, 'tencent', 'Fixture article', 'First independently verified paragraph.\nLast independently verified paragraph.', { readbackTimeout: 500 });
      assert.equal(result.status, 'verified'); assert.equal(result.evidence.bodySamplesMatched, 2);
      articleBody = '<h1>Different article</h1><p>First independently verified paragraph.</p>';
      await assert.rejects(verifyArticle(page, 'tencent', 'Fixture article', 'First independently verified paragraph.\nLast independently verified paragraph.', { readbackTimeout: 100 }), { code: 'UNVERIFIED' });
    });
    await t.test('success modal without a permanent URL is not successful publication', async subtest => {
      articleBody = '<div role="dialog">发布成功</div>';
      if (!await fixtureNavigation(subtest, 'https://cloud.tencent.com/developer/article/write')) return;
      await assert.rejects(verifyArticle(page, 'tencent', 'Fixture article', 'First independently verified paragraph.', { discoveryTimeout: 100 }), { code: 'UNVERIFIED' });
    });
    await t.test('Gmail proof binds exact new thread and same-message recipient/body', async subtest => {
      const query = 'in:sent to:reader@example.test newer_than:1d';
      const list = '<input name="q"><table><tr class="zA" data-legacy-thread-id="new1"><td class="bog">Fixture subject</td></tr></table>';
      const sameMessage = '<h2 class="hP">Fixture subject</h2><div class="adn"><span class="g2" email="reader@example.test"></span><div class="a3s">Fixture body</div></div>';
      await ctx.route('https://mail.google.com/**', route => route.fulfill({ contentType: 'text/html', body: list }));
      if (!await fixtureNavigation(subtest, 'https://mail.google.com/mail/u/0/#search/' + encodeURIComponent(query))) return;
      await page.evaluate(({ query, sameMessage }) => { document.querySelector('input').value = query;
        document.querySelector('tr').onclick = () => document.body.innerHTML = sameMessage; }, { query, sameMessage });
      // searchMailbox reloads the exact URL: intercept reload with deterministic fixture initialization.
      await ctx.unroute('https://mail.google.com/**');
      await ctx.route('https://mail.google.com/**', route => route.fulfill({ contentType: 'text/html', body: list + '<script>document.querySelector("input").value=' + JSON.stringify(query) + ';document.querySelector("tr").onclick=()=>document.body.innerHTML=' + JSON.stringify(sameMessage) + ';</script>' }));
      const proof = await verifySent(page, { query, previousIds: new Set(), recipient: 'reader@example.test', subject: 'Fixture subject', body: 'Fixture body' });
      assert.equal(proof.evidence.threadId, 'new1');
    });
    await page.close();
  } finally {
    if (second) await second.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (child.exitCode === null && child.pid) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await fs.rm(dir, { recursive: true, force: true });
  }
});
