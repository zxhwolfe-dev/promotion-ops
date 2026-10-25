'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { videoReleasePlan, guardDailyVideoTasks } = require('../lib/video-release-queue');
const { schedulingContinuations } = require('../lib/video-scheduling-continuation');
const asOf = '2026-10-25T13:00:00+08:00';
const item = patch => ({ id: 'ep08:bilibili', episode: 8, channel: 'bilibili',
  publishAt: '2026-10-25T20:00:00+08:00', sha256: 'a'.repeat(64),
  status: 'ready_for_daily_session', qualityGate: 'passed',
  editorialReview: { status: 'required' }, ...patch });
const queue = items => ({ items, deferredScheduling: [{ channel: 'bilibili',
  episodes: [8, 9], notBeforeDay: '2026-10-24', reason: 'native continuation' }] });

test('unreviewed completed media does not become a new upload instruction', () => {
  const result = videoReleasePlan(queue([item()]), asOf);
  assert.equal(result.items[0].action, 'complete_editorial_review_before_publication');
  assert.equal(result.dueUploads.length, 0);
  assert.equal(result.schedulingContinuations[0].status, 'needs_editorial_review');
});
test('unknown result keeps reconciliation priority over editorial review', () => {
  const result = videoReleasePlan(queue([item({ status: 'unknown' })]), asOf);
  assert.equal(result.items[0].action, 'reconcile_existing_do_not_upload');
  assert.equal(result.schedulingContinuations[0].remaining[0].action,
    'reconcile_existing_then_editorial_review_do_not_submit');
});
test('editorial metadata never cancels or replaces an existing native appointment', () => {
  const result = videoReleasePlan(queue([item({ status: 'scheduled_native_verified',
    nativeId: 'BV-existing', evidence: '/receipt.json', scheduleVerifiedAt: asOf })]), asOf);
  assert.equal(result.items[0].action, 'wait_native_schedule');
  assert.deepEqual(result.schedulingContinuations, []);
});
test('reviewed media can still continue alongside one unreviewed item', () => {
  const items = [item(), item({ id: 'ep09:bilibili', episode: 9,
    publishAt: '2026-10-26T20:00:00+08:00', sha256: 'b'.repeat(64), editorialReview: { status: 'approved' } })];
  const result = schedulingContinuations(queue(items), Date.parse(asOf))[0];
  assert.equal(result.status, 'ready_to_resume_native_scheduling');
  assert.equal(result.remaining[0].action, 'complete_editorial_review_before_schedule');
  assert.equal(result.remaining[1].action, 'prepare_future_native_schedule');
});
test('ordinary daily task inherits an editorial hold instead of suggesting publication', () => {
  const slot = item({ channel: 'youtube', id: 'ep08:youtube' });
  const releases = videoReleasePlan({ items: [slot] }, asOf);
  const result = guardDailyVideoTasks({ current: [{ kind: 'workstation_short',
    date: '2026-10-25', channel: 'youtube', status: 'due' }] }, releases);
  assert.equal(result.current[0].status, 'needs_editorial_review');
  assert.equal(result.current[0].nextAction, 'complete_editorial_review_before_publication');
});
