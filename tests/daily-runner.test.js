'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { dailyRun } = require('../lib/daily-runner');
const { main: dailyCLI } = require('../scripts/ops/daily-run');
const { DEFAULT_CONTRACT } = require('../lib/operating-contract');

const asOf = '2026-11-13T12:00:00+08:00';
const day = '2026-11-13';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'promotion-manual-daily-'));
  const oldState = process.env.PROMO_STATE_DIR;
  process.env.PROMO_STATE_DIR = path.join(root, 'locks');
  t.after(async () => {
    if (oldState === undefined) delete process.env.PROMO_STATE_DIR;
    else process.env.PROMO_STATE_DIR = oldState;
    await fs.rm(root, { recursive: true, force: true });
  });
  const policy = {
    activeContract: DEFAULT_CONTRACT,
    videoReleaseQueue: path.join(root, 'queue.json'),
    currentRun: path.join(root, 'receipt.json'),
    latestDailyMetrics: path.join(root, 'metrics.json'),
    latestDailyHandoff: path.join(root, 'handoff.md'),
    channelRegistry: path.join(root, 'registry.json'),
  };
  const config = {
    stateRoot: path.join(root, 'state'),
    outputRoot: path.join(root, 'output'),
    policyFile: path.join(root, 'policy.json'),
  };
  await Promise.all([
    fs.writeFile(policy.videoReleaseQueue, JSON.stringify({ items: [], currentCounts: {} })),
    fs.writeFile(policy.currentRun, JSON.stringify({ date: day, publiclyPublished: [] })),
    fs.writeFile(policy.latestDailyMetrics, JSON.stringify({ date: day, rows: [] })),
    fs.writeFile(policy.latestDailyHandoff, '# 2026-11-13'),
    fs.writeFile(policy.channelRegistry, JSON.stringify({ channels: [] })),
    fs.writeFile(config.policyFile, JSON.stringify(policy)),
  ]);
  return { config, policy };
}

test('manual plan persists a report without invoking the generator', async t => {
  const { config } = await fixture(t);
  const result = await dailyRun({
    config, asOf, dependencies: { build: async () => assert.fail('plan called build') },
  });
  assert.equal(result.status, 'planned_no_browser_or_publication');
  assert.equal(result.platformOperations, false);
  const index = JSON.parse(await fs.readFile(path.join(config.stateRoot, 'latest-run.json')));
  assert.equal(index.date, day);
});

test('retired batch publish is rejected even with the former activation flags', async () => {
  const config = { activation: { publishEnabled: true, liveValidatedAdapters: { douyin: true } } };
  await assert.rejects(dailyRun({ config, mode: 'publish', asOf }), /manual plan\/build/);
  await assert.rejects(
    dailyCLI(['--config', '/unused-former-timer-config.json', '--as-of', asOf, '--mode', 'publish']),
    /Choose plan or build/,
  );
});

test('manual build queues the generated jobs without calling a publisher', async t => {
  const { config, policy } = await fixture(t);
  const jobs = [{ channel: 'douyin' }, { channel: 'youtube' }];
  const registerJobs = t.mock.fn(async () => {});
  const publish = t.mock.fn(async () => assert.fail('manual build called publish'));
  const result = await dailyRun({
    config, mode: 'build', asOf, dependencies: { build: async () => ({ jobs }), registerJobs, publish },
  });
  assert.equal(result.status, 'built_only_no_publication');
  assert.equal(result.platformOperations, false);
  assert.deepEqual(registerJobs.mock.calls.map(call => call.arguments), [[policy.videoReleaseQueue, jobs, asOf]]);
  assert.equal(publish.mock.callCount(), 0);
});

test('registered daily package with missing assets blocks duplicate generation', async t => {
  const { config } = await fixture(t);
  const adopted = path.join(config.stateRoot, 'daily-packages');
  await fs.mkdir(adopted, { recursive: true });
  await fs.writeFile(path.join(adopted, day + '.json'), JSON.stringify({ packageRoot: path.join(adopted, 'missing') }));
  const result = await dailyRun({ config, mode: 'build', asOf });
  assert.equal(result.status, 'blocked');
  assert.match(result.failures[0].reason, /ENOENT/);
});

test('queue identity conflict blocks acceptance of a manual build', async t => {
  const { config } = await fixture(t);
  const result = await dailyRun({
    config, mode: 'build', asOf,
    dependencies: {
      build: async () => ({ jobs: [{ channel: 'douyin' }] }),
      registerJobs: async () => { throw Error('queue identity conflict'); },
    },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.platformOperations, false);
  assert.match(result.failures[0].reason, /queue identity conflict/);
});

test('same-day planning preserves the first run in history', async t => {
  const { config } = await fixture(t);
  await dailyRun({ config, asOf });
  await dailyRun({ config, asOf: '2026-11-13T13:00:00+08:00' });
  const runs = path.join(config.outputRoot, day, 'runs');
  assert.equal((await fs.readdir(runs)).length, 2);
  const index = JSON.parse(await fs.readFile(path.join(config.stateRoot, 'latest-run.json')));
  assert.equal(path.dirname(index.report), runs);
});
