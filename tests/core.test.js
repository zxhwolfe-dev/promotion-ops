'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { OpsError, redact, trustedURL, normalize, until, readText } = require('../lib/ops');
const { withLock, writeOnce, hash, stateDir } = require('../lib/state');
const { endpointConfig, withBrowser, withPage } = require('../lib/cdp');
const { prepareURLs, validateResponse, pushURLs } = require('../lib/baidu');
const { parseCount } = require('../lib/metrics');
const { redditThread, findRedditComment, findOSChinaComment } = require('../lib/comments');
const { articleURL, fingerprints, validateTitle } = require('../lib/articles');
const { email, queryFromHash } = require('../lib/gmail');
let dir;
before(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'promo-core-')); process.env.PROMO_STATE_DIR = dir; });
after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code);
const verified = { status: 'verified', evidence: { kind: 'test_only' } };
function fake() {
  const events = [];
  function page(url = 'about:blank') {
    let closed = false;
    return { url: () => url, isClosed: () => closed, setDefaultTimeout() {}, setDefaultNavigationTimeout() {},
      async bringToFront() { events.push('foreground'); }, async close() { closed = true; events.push('page.close'); } };
  }
  const borrowed = page('https://example.com/existing');
  const context = { pages: () => [borrowed], async newPage() { events.push('newPage'); return page(); } };
  const browser = { contexts: () => [context], async close() { events.push('browser.disconnect'); } };
  const chromium = { async connectOverCDP() { events.push('connect'); return browser; } };
  return { events, context, browser, borrowed, options: { chromium } };
}
test('CDP aliases and HTTP/WebSocket share a single lock', () => {
  assert.equal(endpointConfig('http://127.0.0.1:9234').lockKey, endpointConfig('ws://localhost:9234/devtools/browser/id').lockKey);
  assert.equal(endpointConfig('http://[::1]:9234').lockKey, 'cdp:loopback:9234');
});
test('CDP refuses remote hosts, userinfo and query tokens', () => {
  for (const url of ['http://192.168.1.1:9234', 'http://127.0.0.1.evil.test:9234', 'http://user:pass@localhost:9234', 'http://localhost:9234/?token=abc', 'file:///tmp/devtools']) assert.throws(() => endpointConfig(url), { code: 'UNSAFE_CDP' });
});
test('withPage awaits callback, closes only its page, then disconnects', async () => {
  const f = fake();
  assert.equal(await withPage(async () => { await new Promise(r => setTimeout(r, 5)); f.events.push('callback.done'); return 42; }, f.options), 42);
  assert.deepEqual(f.events, ['connect', 'newPage', 'callback.done', 'page.close', 'browser.disconnect']);
  assert.equal(f.borrowed.isClosed(), false);
});
test('borrowed page is never closed', async () => {
  const f = fake(); await withPage(async page => assert.equal(page, f.borrowed), { ...f.options, reuseURL: f.borrowed.url() });
  assert.deepEqual(f.events, ['connect', 'browser.disconnect']);
});
test('ordinary error closes owned page and releases connection lock', async () => {
  const f = fake(); await rejectsCode(withPage(async () => { throw new OpsError('BOOM', 'test'); }, f.options), 'BOOM');
  assert.deepEqual(f.events.slice(-2), ['page.close', 'browser.disconnect']);
  await withBrowser(async () => true, f.options);
});
test('human challenge keeps page but disconnects', async () => {
  const f = fake(); await rejectsCode(withPage(async () => { throw new OpsError('HUMAN_REQUIRED', 'test', 3); }, f.options), 'HUMAN_REQUIRED');
  assert.equal(f.events.includes('page.close'), false); assert.equal(f.events.at(-1), 'browser.disconnect');
});
test('missing context fails without creating another context', async () => {
  const f = fake(); f.browser.contexts = () => [];
  await rejectsCode(withBrowser(async () => assert.fail(), f.options), 'NO_DEFAULT_CONTEXT');
  assert.equal(f.events.at(-1), 'browser.disconnect');
});
test('connect failure releases lock', async () => {
  await assert.rejects(withBrowser(async () => {}, { chromium: { connectOverCDP: async () => { throw new Error('offline'); } } }), /offline/);
  await withBrowser(async () => true, fake().options);
});
test('disconnect failure does not replace the primary failure', async () => {
  const f = fake(); f.browser.close = async () => { throw new Error('disconnect error'); };
  await rejectsCode(withBrowser(async () => { throw new OpsError('PRIMARY', 'primary'); }, f.options), 'PRIMARY');
});
test('legacy fuzzy reuse is rejected', async () => {
  await rejectsCode(withPage(async () => {}, { reuse: () => true }), 'UNSAFE_REUSE');
});
test('file mutex rejects another independent Node process', async () => {
  const script = `require(${JSON.stringify(path.resolve(__dirname, '../lib/state'))}).withLock('cross-process', async () => { console.log('READY'); await new Promise(r => { process.stdin.once('data', r); process.stdin.resume(); }); process.stdin.pause(); }).catch(e => {console.error(e);process.exitCode=1;});`;
  const child = spawn(process.execPath, ['-e', script], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    await once(child.stdout, 'data');
    await rejectsCode(withLock('cross-process', async () => assert.fail()), 'BUSY');
    const exited = once(child, 'exit'); child.stdin.end('release');
    assert.equal((await exited)[0], 0);
    await withLock('cross-process', async () => true);
  } finally { if (child.exitCode === null) child.kill(); }
});
test('old lock is not automatically stolen by age', async () => {
  const file = path.join(stateDir(), 'locks', hash('old') + '.lock');
  await fs.writeFile(file, JSON.stringify({ pid: 9999999, createdAt: '2000-01-01', nonce: 'other' }));
  await rejectsCode(withLock('old', async () => assert.fail()), 'BUSY'); await fs.unlink(file);
});
test('write-once persists before side effect and skips verified duplicate', async () => {
  let calls = 0;
  const intent = { kind: 'unit.success', body: 'private body', recipient: 'private@example.test' };
  const operation = async ({ operationId, submit }) => {
    await submit(async () => {
      const record = JSON.parse(await fs.readFile(path.join(stateDir(), 'operations', operationId + '.json')));
      assert.equal(record.status, 'submitted'); calls++;
    }); return verified;
  };
  const result = await writeOnce(intent, operation);
  assert.equal(result.status, 'verified');
  assert.equal((await writeOnce({ recipient: intent.recipient, body: intent.body, kind: intent.kind }, operation)).status, 'already_verified');
  assert.equal(calls, 1);
  const content = await fs.readFile(path.join(stateDir(), 'operations', result.operationId + '.json'), 'utf8');
  assert.equal(content.includes('private body'), false); assert.equal(content.includes('private@example.test'), false);
});
test('uncertain submitted write is never replayed', async () => {
  const intent = { kind: 'unit.unknown' }; let calls = 0;
  await assert.rejects(writeOnce(intent, async ({ submit }) => { await submit(async () => { calls++; throw new Error('timeout'); }); }), error => error.exitCode === 2);
  await rejectsCode(writeOnce(intent, async () => { calls++; return verified; }), 'RECONCILE_REQUIRED'); assert.equal(calls, 1);
});
test('human challenge after submit records needs_human', async () => {
  await assert.rejects(writeOnce({ kind: 'unit.human' }, async ({ submit }) => { await submit(async () => {}); throw new OpsError('HUMAN_REQUIRED', 'captcha', 3); }), error => error.details.state === 'needs_human' && error.exitCode === 3);
});
test('stale prepared record is provably side-effect-free and reruns without manual reconcile', async () => {
  // Counterexample this guards: a process crash after writing 'prepared' but before submit()
  // previously blocked forever with RECONCILE_REQUIRED even though action() can only run after
  // the 'submitted' record is durably written.
  const intent = { kind: 'unit.stale_prepared' };
  const operationId = hash(JSON.stringify((function canonical(v){ if(Array.isArray(v)) return v.map(canonical); if(v&&typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])); return v; })(intent)));
  const file = path.join(stateDir(), 'operations', operationId + '.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ operationId, kind: intent.kind, status: 'prepared', startedAt: '2026-09-17T00:00:00.000Z' }, null, 2));
  let calls = 0;
  const result = await writeOnce(intent, async ({ submit }) => { await submit(async () => { calls++; }); return verified; });
  assert.equal(result.status, 'verified');
  assert.equal(calls, 1);
  const record = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(record.status, 'verified');
  assert.ok(record.reviews.some(review => review.decision === 'auto_recovered_stale_prepared'), 'recovery must be auditable');
});
test('known failure before submit may be retried', async () => {
  const intent = { kind: 'unit.preflight' };
  await rejectsCode(writeOnce(intent, async () => { throw new OpsError('BAD_INPUT', 'bad'); }), 'BAD_INPUT');
  assert.equal((await writeOnce(intent, async ({ submit }) => { await submit(async () => {}); return verified; })).status, 'verified');
});
test('no evidence is not success; double submit is rejected', async () => {
  await rejectsCode(writeOnce({ kind: 'unit.empty' }, async ({ submit }) => { await submit(async () => {}); return { status: 'verified' }; }), 'UNVERIFIED');
  let calls = 0;
  await rejectsCode(writeOnce({ kind: 'unit.double' }, async ({ submit }) => { await submit(async () => calls++); await submit(async () => calls++); return verified; }), 'DOUBLE_SUBMIT');
  assert.equal(calls, 1);
});
test('API URLs are deduplicated and cross-site/credential URLs rejected', () => {
  assert.deepEqual(prepareURLs('https://example.com/a#one\nhttps://example.com/a#two', 'https://example.com').urls, ['https://example.com/a']);
  for (const url of ['http://example.com/a', 'https://evil.example/a', 'https://example.com/a?token=secret']) assert.throws(() => prepareURLs(url, 'https://example.com'));
});
test('Baidu valid acceptance includes zero remaining quota', () => {
  assert.deepEqual(validateResponse({ success: 2, remain: 0 }, 2), { accepted: 2, remain: 0 });
});
test('Baidu rejects partial, malformed and explicit errors', () => {
  for (const value of [{ error: 401 }, { success: 1, remain: 0 }, { success: '2', remain: 0 }, { success: 2, remain: 0, not_same_site: ['x'] }, null, []]) assert.throws(() => validateResponse(value, 2));
});
test('Baidu uses HTTPS/encoded token/no redirect; exactly one POST', async () => {
  let calls = 0;
  const result = await pushURLs({ site: 'https://example.com', urls: ['https://example.com/a'], token: 'a&b=secret' }, { fetchImpl: async (url, options) => {
    calls++; assert.equal(url.protocol, 'https:'); assert.equal(url.searchParams.get('token'), 'a&b=secret'); assert.equal(options.redirect, 'error'); assert.equal(options.method, 'POST'); assert.ok(options.signal);
    return { ok: true, text: async () => '{"success":1,"remain":0}' };
  } }); assert.equal(calls, 1); assert.equal(result.accepted, 1);
});
test('Baidu network error is redacted and not retried', async () => {
  let calls = 0;
  await assert.rejects(pushURLs({ site: 'https://example.com', urls: ['https://example.com'], token: 'private' }, { fetchImpl: async () => { calls++; throw new Error('token=private'); } }), error => error.code === 'PUSH_OUTCOME_UNKNOWN' && !error.message.includes('private'));
  assert.equal(calls, 1);
});
test('Baidu HTTP and non-JSON responses are failures', async () => {
  await rejectsCode(pushURLs({ site: 'https://example.com', urls: ['https://example.com/a'], token: 'test' }, { fetchImpl: async () => ({ ok: false, status: 503 }) }), 'BAIDU_HTTP_ERROR');
  await rejectsCode(pushURLs({ site: 'https://example.com', urls: ['https://example.com/a'], token: 'test' }, { fetchImpl: async () => ({ ok: true, text: async () => '<html>login</html>' }) }), 'INVALID_API_RESPONSE');
});
test('metric counts preserve zero and correctly parse units', () => {
  for (const [raw, expected] of [['0', 0], ['1,234', 1234], ['阅读量：1.2万', 12000], ['2.5k views', 2500], ['3M', 3000000]]) assert.equal(parseCount(raw)?.value, expected);
  for (const raw of ['正文2026年阅读10次', '1,23', 'NaN', '-1', '1.5', '']) assert.equal(parseCount(raw), null);
});
test('Reddit comment proof binds new ID, full body, author, target and permalink ID', () => {
  const row = { id: 't1_xyz', author: 'Alice', body: 'Full comment text', url: 'https://old.reddit.com/r/test/comments/abc/title/xyz/' };
  const expected = { previousIds: new Set(), author: 'alice', text: row.body, threadId: 'abc' };
  assert.equal(findRedditComment([row], expected), row);
  for (const changed of [{ id: 't1_wrong' }, { author: 'Bob' }, { body: 'Full comment' }, { url: row.url.replace('/abc/', '/other/') }]) assert.equal(findRedditComment([{ ...row, ...changed }], expected), undefined);
  assert.equal(findRedditComment([row], { ...expected, previousIds: new Set([row.id]) }), undefined);
});
test('Reddit input normalizes new UI and rejects reply-level URL', () => {
  assert.equal(redditThread('https://www.reddit.com/r/test/comments/abc/title/?x=1').url, 'https://old.reddit.com/r/test/comments/abc/title/');
  assert.throws(() => redditThread('https://www.reddit.com/r/test/comments/abc/title/xyz/'));
});
test('OSChina count or matching body without author is insufficient', () => {
  const row = { id: '7', body: 'Complete text', authors: ['https://my.oschina.net/u/99'] };
  const expected = { previousIds: new Set(), author: '99', text: row.body };
  assert.equal(findOSChinaComment([row], expected), row);
  assert.equal(findOSChinaComment([{ ...row, authors: [] }], expected), undefined);
  assert.equal(findOSChinaComment([row], { ...expected, previousIds: new Set(['7']) }), undefined);
});
test('URL validation rejects lookalike hosts and non-HTTPS schemes', () => {
  for (const raw of ['https://cloud.tencent.com.evil.test/a', 'javascript:alert(1)', 'https://user:pass@cloud.tencent.com/a']) assert.throws(() => trustedURL(raw, ['cloud.tencent.com']));
  assert.equal(articleURL('tencent', 'https://cloud.tencent.com/developer/article/write'), null);
  assert.equal(articleURL('tencent', 'https://cloud.tencent.com/developer/article/123?a=b#x'), 'https://cloud.tencent.com/developer/article/123');
});
test('input/title/email validation is explicit', () => {
  assert.throws(() => validateTitle('one\ntwo')); assert.throws(() => email('a@example.com\r\nBcc:b@example.com'));
  assert.equal(email('A@example.com'), 'a@example.com'); assert.equal(queryFromHash('#search/to%3Aa%40b.com'), 'to:a@b.com');
  assert.throws(() => fingerprints('short')); assert.equal(normalize(' a\n b '), 'a b');
});
test('text files reject empty input and normalize BOM/CRLF', async () => {
  const file = path.join(dir, 'body.txt'); await fs.writeFile(file, '\uFEFFa\r\nb'); assert.equal(await readText(file), 'a\nb');
  await fs.writeFile(file, ' '); await rejectsCode(readText(file), 'EMPTY_CONTENT');
});
test('readonly polling propagates exceptions instead of retrying writes', async () => {
  let calls = 0; await assert.rejects(until(async () => { calls++; throw new Error('no retry'); }, { timeout: 50 }), /no retry/); assert.equal(calls, 1);
  await rejectsCode(until(async () => false, { timeout: 5, interval: 1 }), 'UNVERIFIED');
});
test('log redaction hides environment tokens and query credentials', () => {
  process.env.TEST_API_TOKEN = 'secret&value';
  assert.equal(redact('secret&value secret%26value').includes('secret'), false);
  assert.equal(redact('https://host/?token=abc&x=1').includes('abc'), false); delete process.env.TEST_API_TOKEN;
});
test('all platform scripts are import-safe (no CDP or writes on require)', async () => {
  for (const platform of ['aliyun', 'baidu-ziyuan', 'csdn', 'gmail', 'oschina', 'reddit', 'search-console', 'stats', 'tencent-cloud']) {
    for (const file of await fs.readdir(path.join(__dirname, '../scripts', platform))) if (file.endsWith('.js')) assert.equal(typeof require(path.join(__dirname, '../scripts', platform, file)), 'function');
  }
});
test('reconciliation requires explicit operator attestation and never sends', async () => {
  const { reconcile } = require('../lib/state');
  const intent = { kind: 'tencent.manual-unit' }; let id;
  await assert.rejects(writeOnce(intent, async ({ operationId, submit }) => { id = operationId; await submit(async () => {}); throw new Error('unknown'); }));
  assert.equal((await reconcile(id)).record.status, 'unknown');
  await rejectsCode(reconcile(id, 'not-written', 'https://cloud.tencent.com/developer/article/123'), 'MANUAL_CONFIRMATION_REQUIRED');
  await rejectsCode(reconcile(id, 'verified', 'https://evil.example/article/123', true), 'UNTRUSTED_URL');
  assert.equal((await reconcile(id, 'not-written', 'https://cloud.tencent.com/developer/article/123', true)).state, 'retry_authorized');
  const result = await writeOnce(intent, async ({ submit }) => { await submit(async () => {}); return verified; });
  assert.equal(result.status, 'verified');
  assert.equal((await reconcile(id)).record.reviews.length, 1);
  await rejectsCode(reconcile(id, 'not-written', 'https://cloud.tencent.com/developer/article/123', true), 'ALREADY_VERIFIED');
});
test('redacting structured results preserves JSON syntax and escaped secrets', () => {
  const out = JSON.parse(redact(JSON.stringify({ url: 'https://example.test/?token=private' })));
  assert.equal(out.url, 'https://example.test/?token=[REDACTED]');
  process.env.TEST_API_TOKEN = 'quoted"secret';
  assert.equal(JSON.parse(redact(JSON.stringify({ value: process.env.TEST_API_TOKEN }))).value, '[REDACTED]');
  delete process.env.TEST_API_TOKEN;
});

test('a primitive callback error still preserves a page when keepOnError is requested', async () => {
  const f = fake();
  await withPage(async () => { throw null; }, { ...f.options, keepOnError: true }).then(() => assert.fail(), error => assert.equal(error, null));
  assert.equal(f.events.includes('page.close'), false);
  assert.equal(f.events.at(-1), 'browser.disconnect');
});
