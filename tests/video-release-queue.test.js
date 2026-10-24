'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { videoReleasePlan, guardDailyVideoTasks } = require('../lib/video-release-queue');
const asOf = '2026-10-24T10:00:00+08:00';
function row(overrides = {}) { return { id:'ep01:youtube', episode:1, channel:'youtube',
  publishAt:asOf, sha256:'a'.repeat(64), status:'ready_for_daily_session', qualityGate:'passed', ...overrides }; }
const plan = item => videoReleasePlan({items:[item]}, asOf).items[0];
test('fallback is eligible in the scheduled Shanghai calendar day session, without waiting for an uninstalled clock', () => {
  assert.equal(plan(row()).action, 'publish_in_authorized_daily_session');
  assert.equal(plan(row({publishAt:'2026-10-24T10:00:00Z'})).action, 'publish_in_authorized_daily_session');
});
test('missed fallback days require review, never automatic catch-up bursts', () => {
  const q = videoReleasePlan({items:[row({publishAt:'2026-10-23T18:00:00+08:00'}),row({id:'ep02:youtube',publishAt:'2026-10-24T18:00:00+08:00',sha256:'b'.repeat(64)})]},asOf);
  assert.equal(q.dueReviews.length,1); assert.equal(q.dueUploads.length,1);
  assert.equal(q.items[0].action,'review_missed_slot_do_not_bulk_publish');
  assert.equal(plan(row({publishAt:'2026-10-24T16:00:00Z'})).action,'wait_daily_session');
});
test('appointments require native evidence and only trigger readback when due', () => {
  const item=row({status:'scheduled_native_verified',evidence:'/receipt.json',nativeId:'native1',scheduleVerifiedAt:'2026-10-23T10:00:00Z'});
  assert.equal(plan(item).action, 'verify_native_publication_do_not_upload');
  assert.equal(plan({...item,publishAt:'2026-10-25T10:00:00+08:00'}).action, 'wait_native_schedule');
  assert.throws(()=>plan({...item,nativeId:null}), /Native schedule/);
});
test('unknown/submitted/reserved and uploaded content never becomes a fresh upload', () => {
  for(const status of ['unknown','submitted','reserved','uploaded']) assert.equal(plan(row({status})).action, 'reconcile_existing_do_not_upload');
});
test('published and copied mean measure only', () => {
  for(const status of ['published','published_native_verified','copied']) assert.equal(plan(row({status})).action, 'measure_only');
});
test('duplicate daily slots or media on same channel fail closed', () => {
  assert.throws(()=>videoReleasePlan({items:[row(),row({id:'ep02:youtube',sha256:'b'.repeat(64)})]},asOf),/Duplicate/);
  assert.throws(()=>videoReleasePlan({items:[row(),row({id:'ep02:youtube',publishAt:'2026-10-25T10:00:00+08:00'})]},asOf),/Duplicate/);
  assert.equal(videoReleasePlan({items:[row(),row({id:'ep01:tiktok',channel:'tiktok'})]},asOf).items.length,2);
});
test('invalid times and unreviewed assets cannot be released', () => {
  assert.throws(()=>plan(row({qualityGate:'pending'})),/quality gate/);
  assert.throws(()=>plan(row({publishAt:'2026-02-30T10:00:00+08:00'})),/Invalid/);
  assert.throws(()=>videoReleasePlan({items:[]},'2026-10-24T10:00:00'),/explicit ISO/);
});

test('daily task defers to a native appointment without marking it published', () => {
  const base = { complete:false, completedTasks:0, current:[{kind:'workstation_short',channel:'youtube',date:'2026-10-24',status:'due',nextAction:'prepare_and_execute_in_current_authorized_session'}] };
  const releases = videoReleasePlan({items:[row({publishAt:'2026-10-24T18:00:00+08:00',status:'scheduled_native_verified',evidence:'/receipt.json',nativeId:'native1',scheduleVerifiedAt:'2026-10-23T10:00:00Z'})]},asOf);
  const guarded = guardDailyVideoTasks(base,releases);
  assert.equal(guarded.current[0].status,'awaiting_native_schedule');
  assert.equal(guarded.current[0].nextAction,'wait_native_schedule');
  assert.equal(guarded.complete,false); assert.equal(guarded.completedTasks,0);
  assert.equal(base.current[0].status,'due');
});
test('a queued upload or missing publication receipt cannot prompt a duplicate daily post', () => {
  const base = { current:[{kind:'workstation_short',channel:'youtube',date:'2026-10-24',status:'due'}] };
  for(const status of ['reserved','uploaded','published']) {
    const result=guardDailyVideoTasks(base,videoReleasePlan({items:[row({status})]},asOf));
    assert.match(result.current[0].nextAction,/do_not_upload/);
    assert.notEqual(result.current[0].status,'complete');
  }
  const done={...base,current:[{...base.current[0],status:'complete',nextAction:'measure_at_review_window'}]};
  assert.equal(guardDailyVideoTasks(done,videoReleasePlan({items:[row()]},asOf)).current[0].nextAction,'measure_at_review_window');
});
