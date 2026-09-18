'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const { writeOnce, writeJSON, readRecord, hash, validateRecord } = require('../lib/state');
const { readText, until } = require('../lib/ops');
const { inspectState } = require('../lib/inspection');
const { articleBodySelectors } = require('../lib/articles');
let root;
before(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'promo-regressions-')); process.env.PROMO_STATE_DIR = root; });
after(async () => { await fs.rm(root, { recursive: true, force: true }); });
const verified = { status: 'verified', evidence: { kind: 'fixture_only' } };

test('parallel submit calls execute at most ONE side effect', async () => {
  let calls = 0;
  await writeOnce({ kind: 'regression.concurrent' }, async ({ submit }) => {
    const results = await Promise.allSettled([submit(async () => { calls++; }), submit(async () => { calls++; })]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'DOUBLE_SUBMIT');
    return verified;
  });
  assert.equal(calls, 1);
});
test('unawaited submission cannot outlive a successful operation', async () => {
  let finished = false;
  await writeOnce({ kind: 'regression.unawaited' }, async ({ submit }) => {
    void submit(async () => { await sleep(25); finished = true; });
    return verified;
  });
  assert.equal(finished, true);
});
test('a rejecting callback keeps its lock until the in-flight side effect settles', async () => {
  let release, entered = false;
  const gate = new Promise(resolve => { release = resolve; });
  const intent = { kind: 'regression.inflight' };
  const outcome = writeOnce(intent, async ({ submit }) => {
    void submit(async () => { entered = true; await gate; });
    throw new Error('callback failed');
  });
  const rejection = assert.rejects(outcome, error => error.exitCode === 2 && error.details.state === 'unknown');
  try {
    await until(() => entered, { timeout: 1000, interval: 5 });
    await assert.rejects(writeOnce(intent, async () => verified), { code: 'BUSY' });
  } finally { release(); }
  await rejection;
});
test('delayed submit after the callback closes is rejected before execution', async () => {
  let saved, calls = 0;
  await assert.rejects(writeOnce({ kind: 'regression.late' }, async ({ submit }) => { saved = submit; return verified; }), { code: 'UNVERIFIED' });
  await assert.rejects(saved(async () => { calls++; }), { code: 'LATE_SUBMIT' });
  assert.equal(calls, 0);
});
test('primitive throws after submission still produce unknown state', async () => {
  await assert.rejects(writeOnce({ kind: 'regression.primitive' }, async ({ submit }) => { await submit(async () => {}); throw null; }),
    error => error.code === 'UNEXPECTED_ERROR' && error.exitCode === 2 && error.details.state === 'unknown');
});
test('an empty evidence object or array cannot mark a write verified', async () => {
  for (const [index, evidence] of [{}, []].entries()) {
    await assert.rejects(writeOnce({ kind: 'regression.evidence', index }, async ({ submit }) => { await submit(async () => {}); return { status: 'verified', evidence }; }), { code: 'UNVERIFIED' });
  }
});
test('corrupted verified record cannot skip execution as already_verified', async () => {
  const intent = { kind: 'regression.corrupt' }; const id = hash(JSON.stringify(intent));
  await writeJSON(path.join(root, 'operations', id + '.json'), { operationId: id, kind: intent.kind, status: 'verified' });
  await assert.rejects(writeOnce(intent, async () => assert.fail('must not run')), { code: 'INVALID_OPERATION_RECORD' });
});
test('record validator rejects wrong operation ID and accepts old valid schema', () => {
  const id = 'a'.repeat(64);
  assert.throws(() => validateRecord({ operationId: 'b'.repeat(64), kind: 'x', status: 'unknown' }, id), { code: 'INVALID_OPERATION_RECORD' });
  assert.equal(validateRecord({ operationId: id, kind: 'x', status: 'unknown' }, id).status, 'unknown');
});
test('failed serialization cleans temporary files and preserves existing record', async () => {
  const dir = path.join(root, 'atomic-test'); const file = path.join(dir, 'saved.json');
  await writeJSON(file, { marker: 'old' });
  const circular = {}; circular.self = circular;
  await assert.rejects(writeJSON(file, circular));
  assert.deepEqual(await readRecord(file), { marker: 'old' });
  assert.deepEqual(await fs.readdir(dir), ['saved.json']);
});
test('input rejects malformed UTF-8 instead of silently publishing replacement characters', async () => {
  const file = path.join(root, 'invalid.txt'); await fs.writeFile(file, Buffer.from([0x66, 0x80, 0x6f]));
  await assert.rejects(readText(file), { code: 'INVALID_UTF8' });
  await fs.writeFile(file, '12345'); await assert.rejects(readText(file, 4), { code: 'INVALID_FILE' });
  assert.equal(await readText(file, 5), '12345');
});
test('run rejects missing and unknown states rather than exiting zero', () => {
  const modulePath = JSON.stringify(path.resolve(__dirname, '../lib/ops'));
  for (const expression of ['{}', '[]', '{status:"unknown"}', '{status:"verified_typo"}']) {
    const result = spawnSync(process.execPath, ['-e', `require(${modulePath}).run(async()=>(${expression}))`], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.equal(JSON.parse(result.stderr).status, 'error');
  }
  const partial = spawnSync(process.execPath, ['-e', `require(${modulePath}).run(async()=>({status:"partial"}))`], { encoding: 'utf8' });
  assert.equal(partial.status, 2); assert.equal(JSON.parse(partial.stdout).status, 'partial');
  const primitive = spawnSync(process.execPath, ['-e', `require(${modulePath}).run(async()=>{throw null})`], { encoding: 'utf8' });
  assert.equal(primitive.status, 1); assert.equal(JSON.parse(primitive.stderr).code, 'UNEXPECTED_ERROR');
});
test('inspection leaves a nonexistent directory untouched', async () => {
  const missing = path.join(root, 'does-not-exist'); const old = process.env.PROMO_STATE_DIR;
  process.env.PROMO_STATE_DIR = missing;
  try {
    const result = await inspectState(); assert.equal(result.readOnly, true); assert.equal(result.pendingCount, 0);
    await assert.rejects(fs.stat(missing), { code: 'ENOENT' });
  } finally { process.env.PROMO_STATE_DIR = old; }
});
test('inspection shows pending work and corrupt records without exposing evidence or mutating files', async () => {
  const before = await fs.readdir(path.join(root, 'operations'));
  const bytes = await Promise.all(before.map(name => fs.readFile(path.join(root, 'operations', name), 'utf8')));
  const result = await inspectState();
  assert.equal(result.readOnly, true); assert.equal(result.status, 'partial'); assert.ok(result.pendingCount >= 3);
  assert.ok(result.errors.some(error => error.code === 'INVALID_OPERATION_RECORD'));
  assert.ok(result.operations.every(row => !('result' in row) && !('evidence' in row)));
  assert.deepEqual(await Promise.all(before.map(name => fs.readFile(path.join(root, 'operations', name), 'utf8'))), bytes);
  assert.deepEqual(await fs.readdir(path.join(root, 'operations')), before);
  const limited = await inspectState({ limit: 1 }); assert.equal(limited.truncated, true); assert.equal(limited.operations.length, 1);
});
test('state root symlinks or Windows junctions are refused without writing into the target', async () => {
  const target = path.join(root, 'link-target'); const link = path.join(root, 'state-link');
  await fs.mkdir(target); await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  process.env.PROMO_STATE_DIR = link;
  try {
    await assert.rejects(writeOnce({ kind: 'regression.link' }, async () => verified), { code: 'UNSAFE_STATE_DIR' });
    await assert.rejects(inspectState(), { code: 'UNSAFE_STATE_DIR' });
    assert.deepEqual(await fs.readdir(target), []);
  } finally { process.env.PROMO_STATE_DIR = root; }
});
test('article scope config is validated and never defaults to whole-page text', () => {
  const old = process.env.PROMO_ARTICLE_BODY_SELECTORS;
  try {
    delete process.env.PROMO_ARTICLE_BODY_SELECTORS;
    assert.deepEqual(articleBodySelectors('tencent'), ['article', '[role="article"]']);
    for (const raw of ['null', '[]', '{', '{"tencent":["body"]}', '{"tencent":[]}']) {
      process.env.PROMO_ARTICLE_BODY_SELECTORS = raw;
      assert.throws(() => articleBodySelectors('tencent'), { code: 'INVALID_BODY_SELECTORS' });
    }
    process.env.PROMO_ARTICLE_BODY_SELECTORS = '{"tencent":["#trusted-content"]}';
    assert.deepEqual(articleBodySelectors('tencent'), ['#trusted-content']);
  } finally { if (old === undefined) delete process.env.PROMO_ARTICLE_BODY_SELECTORS; else process.env.PROMO_ARTICLE_BODY_SELECTORS = old; }
});
test('inspect CLI rejects unknown options before inspecting state', async () => {
  await assert.rejects(require('../scripts/ops/inspect-state')(['--delete-locks']), { code: 'USAGE' });
});

test('a null JSON record is corruption, not permission to resend', async () => {
  const intent = { kind: 'regression.null-record' }; const id = hash(JSON.stringify(intent));
  await fs.writeFile(path.join(root, 'operations', id + '.json'), 'null');
  await assert.rejects(writeOnce(intent, async () => assert.fail('must not run')), { code: 'INVALID_RECORD' });
});
