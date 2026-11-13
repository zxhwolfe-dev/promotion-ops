'use strict';
// Local review coverage only. A review reminder never authorizes publication.
const fs = require('node:fs');
const DAY = 86400000;
const READABLE = new Set(['published', 'public_profile_or_article_observed', 'active',
  'pending_approval', 'owner_visible', 'public_native_comment_verified', 'published_native_verified', 'published_native_verified_external_unknown']);
const MANUAL = /^(wechat[-_]?official|wechat[-_]?channels)$/;
function maintenanceAudit({ channels, observations = [], asOf }) {
  const now = Date.parse(asOf);
  if (!Number.isFinite(now) || !Array.isArray(channels) || !Array.isArray(observations)) throw Error('Invalid channel audit input');
  const stamp = value => {
    const time = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(time) && time <= now ? time : null;
  };
  const iso = value => value === null ? null : new Date(value).toISOString();
  const rows = channels.map(channel => {
    const found = observations.filter(o => o.channel === channel.id && stamp(o.observedAt) !== null);
    const evidenced = found.filter(o => o.evidenceFilePresent === true);
    const readable = evidenced.filter(o => READABLE.has(o.publicationStatus));
    const legacyReadable = /^(complete|current_content_subset|current_status_only|current_item_body)/.test(channel.lastCheckStatus || '');
    const times = [stamp(channel.lastContentReviewAt), legacyReadable ? stamp(channel.lastCheckedAt) : null,
      ...readable.map(o => stamp(o.observedAt))].filter(t => t !== null);
    const reviewed = times.length ? Math.max(...times) : null;
    const attempts = [stamp(channel.lastCheckedAt), ...evidenced.map(o => stamp(o.observedAt))].filter(t => t !== null);
    const attempted = attempts.length ? Math.max(...attempts) : null;
    const days = channel.reviewEveryDays ?? (['daily_primary','daily_native_video'].includes(channel.operationalRole) ? 1 : channel.operationalRole === 'directory_maintenance' ? 14 : 7);
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw Error('Invalid reviewEveryDays');
    const due = reviewed === null || reviewed + days * DAY <= now;
    const numeric = readable.filter(o => Object.values(o.metrics || {}).some(v => typeof v === 'number' && Number.isFinite(v)));
    const latestMetric = numeric.length ? Math.max(...numeric.map(o => stamp(o.observedAt))) : null;
    const isDouyin = (channel.platform || channel.id) === 'douyin';
    const approvedRadar = channel.enabledProgrammes?.includes('radar_daily') && channel.operationalRole === 'daily_native_video';
    const restricted = channel.mode !== 'active' || MANUAL.test(channel.platform || channel.id) || isDouyin && !approvedRadar;
    const failedToday = evidenced.some(o => ['unavailable', 'manual_access_check', 'security_verification_required'].includes(o.publicationStatus) && now - stamp(o.observedAt) < DAY);
    return { id: channel.id, mode: channel.mode, reviewEveryDays: days,
      lastContentReviewAt: iso(reviewed), lastAttemptAt: iso(attempted), lastNumericObservationAt: iso(latestMetric),
      reviewDue: due, coverage: readable.length ? 'evidenced_content_subset' : 'no_current_content_evidence',
      blocker: channel.blockedReason || null, unresolvedPublications: channel.unresolvedPublications || [],
      nextAction: restricted ? 'keep_manual_or_paused' : failedToday ? 'access_failed_defer_do_not_retry' :
        channel.blockedReason ? 'review_blocker_with_human_if_required' : due ? 'review_existing_content_and_relevant_opportunities' : 'wait_review_window',
      automaticPublish: false, automaticOperation: false };
  });
  return { asOf: new Date(now).toISOString(), rows, overdueActive: rows.filter(r => r.mode === 'active' && r.reviewDue && r.nextAction !== 'keep_manual_or_paused').map(r => r.id),
    notes: ['Content-subset review is distinct from complete counters, reach, unique people and conversion.',
      'Failed access and all-null metrics do not become successful measurement; no publish/retry is performed.'] };
}
function loadChannelMaintenance({ registryFile, observations, asOf }) {
  const info = fs.statSync(registryFile);
  if (!info.isFile() || info.size > 16 * 1024 * 1024) throw Error('Channel registry must be a regular JSON file below 16 MiB');
  const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  return { registryFile, ...maintenanceAudit({ channels: registry.channels, observations, asOf }) };
}
module.exports = { maintenanceAudit, loadChannelMaintenance };
