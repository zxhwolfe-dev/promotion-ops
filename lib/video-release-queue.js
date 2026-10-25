'use strict';
const { timestamp, localDay } = require('./daily-execution');
const { schedulingContinuations, requiresEditorialReview } = require('./video-scheduling-continuation');
const PUBLISHED = new Set(['published', 'published_native_verified', 'copied']);
const UNCERTAIN = new Set(['reserved', 'submitted', 'unknown', 'uploaded']);
const CHANNELS = new Set(['tiktok', 'youtube', 'bilibili']);

// Native appointments are checked when due; they never become upload instructions.
function videoReleasePlan(queue, asOf) {
  const now = timestamp(asOf);
  if (now === null || !queue || !Array.isArray(queue.items)) throw new Error('Queue and explicit ISO asOf required');
  const slots = new Map(), media = new Set();
  const items = queue.items.map(item => {
    const due = timestamp(item.publishAt);
    if (!item.id || !CHANNELS.has(item.channel) || due === null || !/^[a-f0-9]{64}$/.test(item.sha256 || '')) {
      throw new Error('Invalid video queue identity, channel, timestamp or SHA');
    }
    const slot = item.channel + ':' + localDay(due), hash = item.channel + ':' + item.sha256;
    if (slots.has(slot) || media.has(hash)) throw new Error('Duplicate channel/day slot or repeated channel media');
    slots.set(slot, item.id); media.add(hash);
    let action;
    if (PUBLISHED.has(item.status)) action = 'measure_only';
    else if (UNCERTAIN.has(item.status)) action = 'reconcile_existing_do_not_upload';
    else if (item.status === 'scheduled_native_verified') {
      if (!item.evidence || !item.nativeId || !item.scheduleVerifiedAt) throw new Error('Native schedule needs receipt evidence, identity and verification time');
      action = now >= due ? 'verify_native_publication_do_not_upload' : 'wait_native_schedule';
    } else if (item.status === 'ready_for_daily_session') {
      if (item.qualityGate !== 'passed') throw new Error('Release requires completed media quality gate');
      const day = localDay(due), today = localDay(now);
      action = requiresEditorialReview(item) ? 'complete_editorial_review_before_publication'
        : day === today ? 'publish_in_authorized_daily_session' : day > today ? 'wait_daily_session' : 'review_missed_slot_do_not_bulk_publish';
    } else throw new Error('Unknown video queue state');
    return { id: item.id, episode: item.episode, channel: item.channel, publishAt: item.publishAt,
      status: item.status, action, sourceDate: item.sourceDate, videoPath: item.videoPath,
      sha256: item.sha256, evidence: item.evidence || null, nativeId: item.nativeId || null };
  });
  return { asOf, readOnly: true, automaticPublish: false, schedulerInstalled: false,
    source: 'local_queue_claims_require_native_readback_before_new_actions', items,
    schedulingContinuations: schedulingContinuations(queue, now),
    dueReviews: items.filter(x => x.action === 'review_missed_slot_do_not_bulk_publish'),
    dueUploads: items.filter(x => x.action === 'publish_in_authorized_daily_session'),
    dueReadbacks: items.filter(x => x.action.includes('verify_native') || x.action.startsWith('reconcile_')) };
}
// Keep receipt-based completion strict while preventing the ordinary daily task from
// suggesting another upload for a slot already handled by this queue.
function guardDailyVideoTasks(plan, releases) {
  return { ...plan, current: plan.current.map(task => {
    if (task.kind !== 'workstation_short' || task.status === 'complete') return task;
    const slot = releases.items.find(item => item.channel === task.channel && localDay(timestamp(item.publishAt)) === task.date);
    if (!slot) return task;
    let action = slot.action, status = task.status;
    if (action === 'wait_native_schedule') status = 'awaiting_native_schedule';
    else if (action === 'complete_editorial_review_before_publication') status = 'needs_editorial_review';
    else if (action === 'verify_native_publication_do_not_upload' || action === 'reconcile_existing_do_not_upload') status = 'needs_result_reconciliation';
    else if (action === 'measure_only') { status = 'needs_receipt_reconciliation'; action = 'verify_native_publication_and_write_receipt_do_not_upload'; }
    return { ...task, status, nextAction: action, videoQueueSlot: slot.id };
  }) };
}
module.exports = { videoReleasePlan, guardDailyVideoTasks };
