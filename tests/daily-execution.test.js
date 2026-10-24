'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { executionPlan, timestamp } = require('../lib/daily-execution');
const { reviewTasks } = require('../lib/receipt-reviews');
const { main } = require('../scripts/ops/daily-execution-plan');
const row = (channel, extra = {}) => ({ channel, status: 'published_native_permalink_verified',
  kind: channel === 'youtube' || channel === 'tiktok' ? 'short_video' : 'three_native_images',
  url: `https://example.test/${channel}/1`, publishedAt: '2026-10-22T18:00:00+08:00',
  verifiedAt: '2026-10-22T18:02:00+08:00', evidence: '/evidence.json', evidenceFilePresent: true, ...extra });
const plan = (rows, extra = {}) => executionPlan({ asOf: '2026-10-22T19:00:00+08:00',
  receipts: [{ date: '2026-10-22', publiclyPublished: rows }], ...extra });
test('all six verified receipts complete the day; no unknown-to-zero metrics', () => {
  const result = plan(['tiktok', 'youtube', 'weibo', 'toutiao', 'xueqiu', 'taoguba'].map(channel => row(channel)));
  assert.equal(result.complete, true); assert.equal(result.completedTasks, 6);
  assert.equal(result.metrics.conversions, null); assert.equal(result.schedulerInstalled, false);
});
test('17:30 gate uses Shanghai even when input clock uses UTC', () => {
  const before = plan([], { asOf: '2026-10-22T09:29:59Z' });
  assert.equal(before.current.filter(task => task.status === 'not_yet_due').length, 4);
  assert.equal(plan([], { asOf: '2026-10-22T09:30:00Z' }).current.filter(task => task.status === 'due').length, 6);
});
test('yesterday pending is a missed day, never today or permission to backfill', () => {
  const result = plan([], { receipts: [{ date: '2026-10-21', pending: [{ kind: 'ak_daily_three_native_cards',
    notBefore: '2026-10-21T17:30:00+08:00', channels: ['weibo', 'toutiao', 'xueqiu', 'taoguba'] }] }] });
  assert.equal(result.unresolvedHistory.length, 4);
  assert.ok(result.unresolvedHistory.every(task => task.status === 'missed_day'));
  assert.equal(result.completedTasks, 0);
});
test('pending, missing evidence, and method posts never satisfy daily three cards', () => {
  const result = plan([row('xueqiu', { kind: 'non_promotional_method_exchange', featureIds: ['ak-battle', 'ak-news', 'ak-limitup'] }),
    row('weibo', { evidenceFilePresent: false }), row('toutiao', { status: 'pending_review' })]);
  assert.equal(result.completedTasks, 0);
  assert.equal(result.current.find(task => task.channel === 'xueqiu').status, 'due');
  assert.equal(result.current.find(task => task.channel === 'toutiao').nextAction, 'verify_existing_result_do_not_resubmit');
});
test('unavailable submission is reconciliation, not another publish', () => {
  const result = plan([], { receipts: [{ date: '2026-10-22', submittedUnavailable: [row('taoguba', { status: 'submitted_then_permalink_unavailable' })] }] });
  assert.equal(result.current.find(task => task.channel === 'taoguba').status, 'needs_result_reconciliation');
});
test('future or premature publish evidence is not accepted as a completed task', () => {
  const result = plan([row('weibo', { publishedAt: '2026-10-22T17:00:00+08:00' }),
    row('tiktok', { verifiedAt: '2026-10-23T01:00:00+08:00' })]);
  assert.equal(result.completedTasks, 0);
});
test('invalid dates and timezone-free input are rejected, including calendar normalization', () => {
  for (const value of ['2026-02-30T18:00:00Z', '2026-10-22T18:00:00', '2026-10-22T24:01:00Z', '2026-10-22T18:00:00+14:30']) {
    assert.equal(timestamp(value), null); assert.throws(() => plan([], { asOf: value }));
  }
});
test('review uses actual same URL evidence and preserves explicit zero', () => {
  const receipt = row('tiktok', { publishedAt: '2026-10-20T18:00:00+08:00' });
  const sample = { channel: 'tiktok', url: receipt.url, scope: 'single_content', windowType: 'cumulative',
    observedAt: '2026-10-21T19:00:00+08:00', evidence: '/sample.json', evidenceFilePresent: true, metrics: { views: 0, likes: null } };
  const tasks = reviewTasks([receipt], [sample], Date.parse('2026-10-22T19:00:00+08:00'));
  assert.equal(tasks[0].status, 'reviewed'); assert.equal(tasks[0].elapsedHours, 25);
  assert.deepEqual(tasks[0].metrics, { views: 0, likes: null });
});
test('all-null counters and public transport checks do not complete measurement', () => {
  const receipt = row('tiktok', { publishedAt: '2026-10-20T18:00:00+08:00' });
  const sample = { channel: 'tiktok', url: receipt.url, scope: 'single_content', windowType: 'cumulative',
    observedAt: '2026-10-21T19:00:00+08:00', evidenceFilePresent: true, metrics: { views: null } };
  assert.equal(reviewTasks([receipt], [sample], Date.parse('2026-10-22T19:00:00+08:00'))[0].status, 'visibility_only_metrics_unknown');
  assert.equal(reviewTasks([receipt], [{ ...sample, scope: 'public_transport' }], Date.parse('2026-10-22T19:00:00+08:00'))[0].status, 'due_for_evidence_check');
});
test('72h observations do not falsely complete 24h window; late sample is labeled', () => {
  const receipt = row('tiktok', { publishedAt: '2026-10-18T18:00:00+08:00' });
  const sample = { channel: 'tiktok', url: receipt.url, scope: 'single_content', windowType: 'cumulative',
    observedAt: '2026-10-22T02:00:00+08:00', evidenceFilePresent: true, metrics: { views: 5 } };
  const tasks = reviewTasks([receipt], [sample], Date.parse('2026-10-22T19:00:00+08:00'));
  assert.equal(tasks[0].status, 'missed_observation_window'); assert.equal(tasks[1].status, 'reviewed_late');
  assert.equal(tasks[1].elapsedHours, 80);
});
test('CLI reads evidence and leaves receipt/snapshot unchanged; strict incomplete exits 2', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promotion-day-'));
  try {
    fs.writeFileSync(path.join(dir, 'evidence.json'), '{}');
    const file = path.join(dir, 'receipt.json');
    const source = JSON.stringify({ date: '2026-10-22', publiclyPublished: [row('tiktok', { evidence: 'evidence.json', evidenceFilePresent: false })] });
    fs.writeFileSync(file, source);
    const result = main(['--as-of', '2026-10-22T19:00:00+08:00', '--receipt', file, '--strict'], {defaultPolicyFile:null});
    assert.equal(result.result.completedTasks, 1); assert.equal(result.exitCode, 2);
    assert.equal(fs.readFileSync(file, 'utf8'), source);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('legacy multi-file evidence requires every actual file and preserves the original receipt', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promotion-evidence-'));
  try {
    fs.writeFileSync(path.join(dir, 'owner.json'), '{}');
    const file = path.join(dir, 'receipt.json');
    const source = JSON.stringify({date: '2026-10-22', publiclyPublished: [row('tiktok', {evidence: ['owner.json', 'public.json']})]});
    fs.writeFileSync(file, source);
    const args = ['--as-of', '2026-10-22T19:00:00+08:00', '--receipt', file];
    assert.equal(main(args, {defaultPolicyFile:null}).result.completedTasks, 0);
    fs.writeFileSync(path.join(dir, 'public.json'), '{}');
    assert.equal(main(args, {defaultPolicyFile:null}).result.completedTasks, 1);
    assert.equal(fs.readFileSync(file, 'utf8'), source);
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
});
