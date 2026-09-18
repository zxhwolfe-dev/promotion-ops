'use strict';
// Fault injection uses isolated state directories and a private fs facade. No CDP or accounts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { EventEmitter } = require('node:events');
const { probeConfig } = require('../scripts/ops/probe-article');
const { validateTargets, collectTarget } = require('../scripts/stats/daily-snapshot');
const { parseCount, readMetric } = require('../lib/metrics');
const filename = path.resolve(__dirname, '../lib/state.js');
const source = fsSync.readFileSync(filename, 'utf8');
const localRequire = createRequire(filename);
const verified = () => ({ status: 'verified', evidence: { kind: 'isolated_fixture' } });

function loadState(directory, fault = '', failState = 'submitted') {
  const facade = { ...fs };
  let lastRenamedStatus;
  const injected = () => Object.assign(new Error(`injected ${fault}`), { code: 'EIO' });
  facade.open = async (...args) => {
    const handle = await fs.open(...args), file = String(args[0]);
    let status;
    return new Proxy(handle, { get(h, key) {
      if (key === 'writeFile') return async text => {
        try { status = JSON.parse(String(text)).status; } catch { /* lock files have no status */ }
        if (status === failState && fault === 'partial-write') { await h.writeFile(String(text).slice(0, 10)); throw injected(); }
        return h.writeFile(text);
      };
      if (key === 'sync') return async () => {
        if ((status === failState && fault === 'file-sync') ||
            (file === path.join(directory, 'operations') && lastRenamedStatus === failState && fault === 'directory-sync')) throw injected();
        return h.sync();
      };
      const value = Reflect.get(h, key, h);
      return typeof value === 'function' ? value.bind(h) : value;
    } });
  };
  facade.rename = async (from, to) => {
    const record = JSON.parse(await fs.readFile(from, 'utf8'));
    if (record.status === failState && fault === 'before-rename') throw injected();
    await fs.rename(from, to); lastRenamedStatus = record.status;
    if (record.status === failState && fault === 'after-rename') throw injected();
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, Error, console,
    require: name => name === 'node:fs/promises' ? facade : localRequire(name),
    process: { platform: process.platform, pid: process.pid, env: { PROMO_STATE_DIR: directory } } }, { filename });
  return module.exports;
}
async function isolated(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'promo-session4-'));
  try { return await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
for (const fault of ['partial-write', 'file-sync', 'before-rename', 'after-rename', ...(process.platform === 'win32' ? [] : ['directory-sync'])]) {
  test(`submitted ${fault} failure never calls the guarded action`, () => isolated(async dir => {
    const state = loadState(dir, fault), intent = { kind: `test.${fault}` }; let effects = 0;
    await assert.rejects(state.writeOnce(intent, async ({ submit }) => { await submit(() => { effects++; }); return verified(); }), { code: 'EIO' });
    assert.equal(effects, 0);
    const file = path.join(dir, 'operations', state.hash(JSON.stringify(intent)) + '.json');
    assert.equal((await state.readRecord(file)).status, 'failed_before_submit');
    assert.equal((await fs.readdir(path.dirname(file))).some(name => name.endsWith('.tmp')), false);
  }));
}
for (const fault of ['partial-write', 'after-rename', ...(process.platform === 'win32' ? [] : ['directory-sync'])]) {
  test(`verified ${fault} failure after action remains unknown, never prepared`, () => isolated(async dir => {
    const state = loadState(dir, fault, 'verified'), intent = { kind: `test.after.${fault}` }; let effects = 0;
    await assert.rejects(state.writeOnce(intent, async ({ submit }) => { await submit(() => { effects++; }); return verified(); }));
    const file = path.join(dir, 'operations', state.hash(JSON.stringify(intent)) + '.json');
    assert.equal(effects, 1); assert.equal((await state.readRecord(file)).status, 'unknown');
    await assert.rejects(state.writeOnce(intent, async () => { effects++; return verified(); }), { code: 'RECONCILE_REQUIRED' });
    assert.equal(effects, 1);
  }));
}
test('restored prepared snapshot does not replay an already completed remote effect (storage rollback MODEL)', () => isolated(async dir => {
  const state = loadState(dir), intent = { kind: 'test.rollback' }; let effects = 0, oldBytes, file;
  await state.writeOnce(intent, async ({ operationId, submit }) => {
    file = path.join(dir, 'operations', operationId + '.json'); oldBytes = await fs.readFile(file);
    await submit(() => { effects++; }); return verified();
  });
  // Models stale durable namespace / restoring old state; NOT an actual Windows power cut.
  await fs.writeFile(file, oldBytes);
  await assert.rejects(state.writeOnce(intent, async ({ submit }) => {
    await submit(() => { effects++; }); return verified();
  }), { code: 'RECONCILE_REQUIRED' });
  assert.equal(effects, 1); assert.equal((await fs.readFile(file)).equals(oldBytes), true);
}));
test('prepared is not proof of zero activity OUTSIDE submit (editor autosave scope)', () => isolated(async dir => {
  const state = loadState(dir); let effects = 0;
  await assert.rejects(state.writeOnce({ kind: 'test.autosave' }, async ({ operationId }) => {
    effects++; // Models an operation callback's autosave, NOT a guarded publish action.
    const file = path.join(dir, 'operations', operationId + '.json');
    assert.equal((await state.readRecord(file)).status, 'prepared');
    throw new Error('stop before submit');
  }));
  assert.equal(effects, 1);
}));
for (const stage of ['prepared', 'submitted']) {
  test(`killing fixture process at ${stage} does not permit an automatic restart`, { timeout: 15000 }, () => isolated(async dir => {
    const script = `const {writeOnce}=require(${JSON.stringify(filename)}); const hold=()=>new Promise(()=>setInterval(()=>{},1000));
      writeOnce({kind:'test.kill'},async({operationId,submit})=>{
        if(${JSON.stringify(stage)}==='prepared'){process.send({operationId});await hold();}
        await submit(async()=>{process.send({operationId});await hold();});
      }).catch(()=>{process.exitCode=1;});`;
    const child = spawn(process.execPath, ['-e', script], { env: { ...process.env, PROMO_STATE_DIR: dir }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    try {
      const [message] = await once(child, 'message', { signal: AbortSignal.timeout(8000) });
      const exit = once(child, 'exit'); child.kill('SIGKILL'); await exit;
      const state = loadState(dir), file = path.join(dir, 'operations', message.operationId + '.json');
      assert.equal((await state.readRecord(file)).status, stage);
      await assert.rejects(state.writeOnce({ kind: 'test.kill' }, async () => assert.fail()), { code: 'BUSY' });
      // Fixture-only cleanup after verifying process death; never a production unlock procedure.
      for (const name of await fs.readdir(path.join(dir, 'locks'))) await fs.unlink(path.join(dir, 'locks', name));
      await assert.rejects(state.writeOnce({ kind: 'test.kill' }, async () => assert.fail()), { code: 'RECONCILE_REQUIRED' });
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
  }));
}
test('probe requires both full nonempty needles before connecting, preserves complex CSS', () => {
  const base = ['tencent', 'https://cloud.tencent.com/developer/article/123', 'first full body needle text', 'last full body needle text'];
  for (const args of [base.slice(0, 3), [...base.slice(0, 3), ''], [...base.slice(0, 2), ' ', base[3]]]) assert.throws(() => probeConfig(args));
  assert.deepEqual(probeConfig([...base, ':is(.main, .fallback)']).selectors, [':is(.main, .fallback)']);
  assert.deepEqual(probeConfig([...base, '["#body", "[role=article]"]']).selectors, ['#body', '[role=article]']);
  assert.throws(() => probeConfig(['constructor', ...base.slice(1)]), { code: 'UNKNOWN_KIND' });
});
test('metric labels cannot be reassigned to a different counter; genuine zero is retained', () => {
  for (const text of ['评论 2', '2 comments', '3赞']) assert.equal(parseCount(text, 'reads'), null);
  assert.equal(parseCount('阅读 20', 'likes'), null);
  assert.equal(parseCount('0', 'likes').value, 0);
  assert.equal(parseCount('2 comments', 'comments').value, 2);
});
const urlA = 'https://cloud.tencent.com/developer/article/123';
const urlB = 'https://cloud.tencent.com/developer/article/456';
const target = { id: 'article-a', kind: 'tencent', url: urlA, metricSelectors: { reads: '#reads', likes: '#likes', comments: '#comments' } };
function mockPage({ switchDuringRead = false, backToA = false, brokenMetric = false, sampleFromB = false, placeholder = false } = {}) {
  const page = new EventEmitter(); let current = urlA, switched = false, reads = 0;
  const frame = { url: () => current }; page.mainFrame = () => frame; page.url = () => current;
  page.goto = async url => { current = url; return { status: () => 200 }; };
  page.locator = selector => ({ filter() { return this; },
    count: async () => selector.startsWith('#aliyun') ? 0 : 1,
    evaluateAll: async () => {
      if (brokenMetric && selector === '#likes') throw new Error('detached');
      if (switchDuringRead && !switched) {
        switched = true; current = urlB; page.emit('framenavigated', frame);
        if (backToA) { current = urlA; page.emit('framenavigated', frame); }
      }
      return { text: placeholder && reads++ === 0 ? '加载中' : ({ '#reads': '12', '#likes': '0', '#comments': '2' }[selector]),
        url: sampleFromB ? urlB : current, busy: false };
    },
  });
  return page;
}
for (const settings of [{ switchDuringRead: true }, { switchDuringRead: true, backToA: true }, { sampleFromB: true }]) {
  test(`snapshot discards wrong-document metrics ${JSON.stringify(settings)}`, async () => {
    const page = mockPage(settings), row = await collectTarget(page, target, { timeout: 20 });
    assert.equal(row.status, 'unavailable'); assert.equal(row.error.code, 'TARGET_CHANGED');
    assert.ok(Object.values(row.metrics).every(metric => metric.value === null));
    assert.equal(page.listenerCount('framenavigated'), 0);
  });
}
test('snapshot keeps good counters if another metric fails; timestamps describe collection', async () => {
  const row = await collectTarget(mockPage({ brokenMetric: true }), target, { timeout: 20 });
  assert.equal(row.status, 'partial'); assert.equal(row.metrics.reads.value, 12);
  assert.equal(row.metrics.comments.value, 2); assert.equal(row.metrics.likes.value, null);
  assert.ok(row.collectedAt >= row.startedAt); assert.equal(row.readiness, 'parseable_dom_only');
});
test('metric wait polls parseable text, not merely an already-visible element', async () => {
  const result = await readMetric(mockPage({ placeholder: true }), '#reads', 500, { metric: 'reads', expectedUrl: urlA });
  assert.equal(result.value, 12);
});
test('targets reject malformed config without any browser work', () => {
  for (const value of [null, [], [null], [{ ...target, id: {} }], [{ ...target, metricSelectors: [] }], [{ ...target, readySelector: 1 }], [{ ...target, id: 'reddit-comments' }]]) assert.throws(() => validateTargets(value));
  assert.equal(validateTargets([target])[0], target);
});
