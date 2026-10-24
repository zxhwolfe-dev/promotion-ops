'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewPlan } = require('../scripts/stats/channel-review-plan');
const asOf = '2026-10-15T14:00:00+08:00';
function channel(overrides = {}) {
  return { id: 'v2ex', platform: 'v2ex', mode: 'active', reviewEveryDays: 1,
    lastCheckedAt: '2026-10-14T14:00:00+08:00', lastCheckStatus: 'complete', ...overrides };
}
function plan(channels) { return reviewPlan({ asOf, channels }); }

test('exact boundaries, timezone equivalence, missing check and future due', () => {
  const result = plan([
    channel(), channel({ id: 'old', lastCheckedAt: '2026-10-13T06:00:00Z' }),
    channel({ id: 'later', reviewEveryDays: 2 }),
    channel({ id: 'new', lastCheckedAt: null, lastCheckStatus: 'not_checked' }),
  ]);
  assert.deepEqual(result.due.map(x => x.id), ['v2ex', 'new']);
  assert.deepEqual(result.overdue.map(x => x.id), ['old']);
  assert.deepEqual(result.notDue.map(x => x.id), ['later']);
  assert.equal(result.asOf, '2026-10-15T06:00:00.000Z');
});

test('partial and not_checked attempts cannot move a complete watermark', () => {
  for (const status of ['partial', 'not_checked']) {
    const input = Object.freeze(channel({ lastCheckStatus: status, lastCheckedAt: asOf,
      lastCompleteCheckAt: '2026-10-12T06:00:00Z' }));
    const result = plan([input]);
    assert.equal(result.overdue[0].dueAt, '2026-10-13T06:00:00.000Z');
    assert.equal(result.overdue[0].lastVerifiedCheckAt, '2026-10-12T06:00:00.000Z');
  }
  assert.equal(plan([channel({ lastCheckedAt: asOf, lastCheckStatus: 'partial' })]).due[0].dueAt, null);
});

test('unknown publication generates verification only, never a resend', () => {
  const result = plan([channel({ publicationStatus: 'unknown' })]);
  assert.equal(result.blocked[0].nextAction, 'verify_remote_result');
  assert.equal(result.blocked[0].automaticPublish, false);
  assert.equal(result.due.length + result.overdue.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /resend|republish/);
});

test('manual platform exclusions override mistaken active and unknown configuration', () => {
  const channels = ['wechat_official', 'wechat_channels', 'douyin', '微信公众号', '微信视频号', '抖音']
    .map((platform, i) => channel({ id: `manual-${i}`, platform, publicationStatus: 'unknown' }));
  const result = plan(channels);
  assert.equal(result.manualOnly.length, channels.length);
  assert.ok(result.manualOnly.every(x => x.automaticOperation === false && x.automaticPublish === false));
  assert.equal(result.blocked.length + result.due.length + result.overdue.length, 0);
});

test('paused, disabled and explicit login blockers remain blocked', () => {
  const result = plan([channel({ mode: 'paused', publicationStatus: 'unknown' }),
    channel({ id: 'off', mode: 'disabled' }), channel({ id: 'login', blockedReason: 'login_required' })]);
  assert.deepEqual(result.blocked.map(x => x.reason), ['paused', 'disabled', 'login_required']);
  assert.ok(result.blocked.every(x => x.automaticOperation === false));
});

test('reject invalid calendar dates, missing timezone, duplicates and future checks', () => {
  for (const bad of [undefined, '2026-10-15', '2026-02-30T00:00:00Z', '2026-10-15T24:00:00Z',
    '2026-10-15T06:00:00+14:01', '2026-10-15T06:00:60Z']) {
    assert.throws(() => reviewPlan({ asOf: bad, channels: [] }));
  }
  assert.throws(() => plan([channel(), channel()]), /Duplicate/);
  assert.throws(() => plan([channel({ lastCheckedAt: '2026-10-15T14:00:01+08:00' })]), /future/);
  assert.throws(() => plan([channel({ lastCheckStatus: 'partial', lastCheckedAt: null,
    lastCompleteCheckAt: '2026-10-16T00:00:00Z' })]), /future/);
  assert.throws(() => plan([channel({ lastCheckedAt: null })]), /complete review/);
  assert.throws(() => plan([channel({ reviewEveryDays: 0 })]), /reviewEveryDays/);
  assert.throws(() => plan([channel({ mode: 'new_mode' })]), /mode/);
});

test('CLI reads without mutating ledger and bad input exits nonzero', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'channel-review-test-'));
  try {
    const input = path.join(root, 'ledger.json');
    const body = JSON.stringify({ asOf, channels: [channel()] });
    fs.writeFileSync(input, body);
    const script = path.resolve(__dirname, '../scripts/stats/channel-review-plan.js');
    const run = spawnSync(process.execPath, [script, input], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).due[0].id, 'v2ex');
    assert.equal(fs.readFileSync(input, 'utf8'), body);
    fs.writeFileSync(input, '{}');
    const bad = spawnSync(process.execPath, [script, input], { encoding: 'utf8' });
    assert.equal(bad.status, 1); assert.equal(bad.stdout, '');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
