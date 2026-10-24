'use strict';
// Receipt-derived local planning. This module never opens a browser or writes a state file.
const AK_CHANNELS = ['weibo', 'toutiao', 'xueqiu', 'taoguba'];
// User added recurring X Radar image posts on this Shanghai date; earlier days retain six tasks.
const X_RADAR_DAILY_START = '2026-10-23';
const VERIFIED = new Set(['published_native_owner_readback_verified', 'published_native_owner_row_verified',
  'published_native_permalink_verified', 'published_native_owner_studio_and_permalink_verified',
  'published_native_owner_and_permalink_verified']);
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const [date, time] = value.split('T'), [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second] = time.slice(0, 8).split(':').map(Number);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = /([+-])(\d{2}):(\d{2})$/.exec(value);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > maxDay || hour > 23 || minute > 59 || second > 59 ||
    (offset && (+offset[2] > 14 || +offset[3] > 59 || (+offset[2] === 14 && +offset[3] !== 0)))) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}
const localDay = instant => new Date(instant + 8 * 3600000).toISOString().slice(0, 10);
function publicURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
function verified(row, now) {
  const published = timestamp(row.publishedAt), checked = timestamp(row.verifiedAt);
  return VERIFIED.has(row.status) && publicURL(row.url) && published !== null && checked !== null &&
    published <= checked && checked <= now && typeof row.evidence === 'string' && row.evidence.length > 0 && row.evidenceFilePresent === true;
}
function matches(row, task) {
  if (row.channel !== task.channel) return false;
  const kind = row.kind || row.type;
  if (kind === 'non_promotional_method_exchange') return false;
  const features = row.featureIds || [];
  if (task.kind === 'radar_daily_three_images') return kind === task.kind;
  if (task.kind === 'ak_daily_three_native_cards') return kind === 'three_native_images' ||
    kind === 'weibo_daily_three_native_cards_sync' ||
    (['ak-battle', 'ak-news', 'ak-limitup'].every(id => features.includes(id)) && !kind);
  return kind === 'short_video' || (!kind && /\/(shorts|video)\//.test(row.url || '') && !features.some(id => id.startsWith('ak-')));
}
function rowsFrom(receipts) {
  return receipts.flatMap(receipt => ['publiclyPublished', 'otherSubmissions', 'submittedUnavailable', 'pending']
    .flatMap(field => (receipt[field] || []).map(row => ({ ...row, receiptDate: receipt.date, sourceReceipt: receipt.sourceReceipt || null }))));
}
function dayTasks(day) {
  return [ ...['tiktok', 'youtube'].map(channel => ({ id: `${day}:short:${channel}`, date: day,
    channel, kind: 'workstation_short', notBefore: `${day}T00:00:00+08:00` })),
  ...AK_CHANNELS.map(channel => ({ id: `${day}:ak:${channel}`, date: day, channel,
    kind: 'ak_daily_three_native_cards', notBefore: `${day}T17:30:00+08:00` })),
  ...(day >= X_RADAR_DAILY_START ? [{ id: `${day}:radar:x`, date: day, channel: 'x',
    kind: 'radar_daily_three_images', notBefore: `${day}T00:00:00+08:00` }] : []) ];
}
function taskState(task, rows, now) {
  const candidates = rows.filter(row => matches(row, task) &&
    (timestamp(row.publishedAt) === null ? row.receiptDate === task.date : localDay(timestamp(row.publishedAt)) === task.date));
  const complete = candidates.filter(row => verified(row, now) &&
    (task.kind !== 'radar_daily_three_images' || (row.featureIds || []).includes('ai-open-source-radar') &&
      Array.isArray(row.assets) && row.assets.length >= 3 && row.assets.length <= 4) &&
    (task.kind !== 'ak_daily_three_native_cards' || timestamp(row.publishedAt) >= timestamp(task.notBefore)));
  const pending = candidates.filter(row => !complete.includes(row));
  let status = 'due', nextAction = 'prepare_and_execute_in_current_authorized_session';
  if (pending.length) { status = 'needs_result_reconciliation'; nextAction = 'verify_existing_result_do_not_resubmit'; }
  else if (complete.length) { status = 'complete'; nextAction = 'measure_at_review_window'; }
  else if (now < timestamp(task.notBefore)) { status = 'not_yet_due'; nextAction = 'continue_other_work_and_return_after_notBefore'; }
  else if (task.date < localDay(now)) { status = 'missed_day'; nextAction = 'record_unmet_day_do_not_backfill_or_republish_old_content'; }
  return { ...task, status, nextAction, verifiedURLs: [...new Set(complete.map(row => row.url))],
    unresolvedResults: pending.map(row => ({ url: row.url || null, status: row.status || 'unknown', sourceReceipt: row.sourceReceipt })),
    automaticPublish: false };
}
function executionPlan({ asOf, receipts }) {
  const now = timestamp(asOf);
  if (now === null) throw new Error('asOf must be a real ISO timestamp with explicit timezone');
  if (!Array.isArray(receipts)) throw new Error('receipts must be an array');
  const today = localDay(now), rows = rowsFrom(receipts), seen = new Set();
  const current = dayTasks(today).map(task => taskState(task, rows, now));
  const unresolvedHistory = [];
  for (const receipt of receipts) for (const old of receipt.pending || []) {
    if (old.kind !== 'ak_daily_three_native_cards') continue;
    const due = timestamp(old.notBefore);
    if (due === null || due > now || localDay(due) >= today) continue;
    for (const channel of old.channels || AK_CHANNELS) {
      if (!AK_CHANNELS.includes(channel)) continue;
      const date = localDay(due), id = `${date}:ak:${channel}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const result = taskState({ id, date, channel, kind: old.kind, notBefore: old.notBefore }, rows, now);
      if (result.status !== 'complete') unresolvedHistory.push(result);
    }
  }
  return { asOf, timezone: 'Asia/Shanghai', date: today, readOnly: true, schedulerInstalled: false,
    automaticPublish: false, source: 'local_receipt_claims_with_existing_evidence_files_not_live_revalidation',
    current, unresolvedHistory, completedTasks: current.filter(task => task.status === 'complete').length,
    requiredTasks: current.length, complete: current.every(task => task.status === 'complete'),
    stalePendingRecords: unresolvedHistory.length,
    metrics: { humanVisitors: null, conversions: null },
    note: 'A local plan does not schedule background execution. Missing receipts do not prove no external action; reconcile reserved submissions before any first click.' };
}
module.exports = { executionPlan, timestamp, localDay };
