'use strict';
const { timestamp, localDay } = require('./daily-execution');
const FINISHED = new Set(['scheduled_native_verified', 'published', 'published_native_verified', 'copied']);
const CHANNELS = new Set(['youtube', 'tiktok', 'bilibili']);

function schedulingContinuations(queue, now) {
  if (queue.deferredScheduling === undefined) return [];
  if (!Array.isArray(queue.deferredScheduling)) throw new Error('Deferred scheduling must be an array');
  return queue.deferredScheduling.flatMap(entry => {
    const next = timestamp(entry.notBeforeDay + 'T00:00:00+08:00');
    if (!CHANNELS.has(entry.channel) || next === null || !Array.isArray(entry.episodes) ||
        !entry.episodes.every(n => Number.isInteger(n) && n > 0)) throw new Error('Invalid native scheduling continuation');
    const remaining = queue.items.filter(item => item.channel === entry.channel &&
      entry.episodes.includes(item.episode) && !FINISHED.has(item.status));
    if (!remaining.length) return [];
    const blocked = localDay(now) < entry.notBeforeDay;
    return [{ channel: entry.channel, notBeforeDay: entry.notBeforeDay, reason: entry.reason,
      status: blocked ? 'blocked_native_daily_quota' : 'ready_to_resume_native_scheduling',
      nextAction: blocked ? 'wait_next_native_day_do_not_submit' : 'check_native_quota_resume_draft_then_schedule_unbooked',
      remainingCount: remaining.length,
      remaining: remaining.map(item => ({ id: item.id, episode: item.episode, status: item.status,
        action: item.status === 'ready_for_daily_session' ? 'prepare_future_native_schedule' : 'reconcile_resume_existing_do_not_upload',
        evidence: item.evidence || null, resumeExistingDraft: item.resumeExistingDraft === true })),
      nativeQuotaMustBeRechecked: true, automaticPublish: false }];
  });
}
module.exports = { schedulingContinuations };
