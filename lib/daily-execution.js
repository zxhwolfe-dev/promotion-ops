'use strict';
// Receipt-derived local planning. This module never opens a browser or writes a state file.
const {activeContract} = require('./operating-contract');
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
function publicationDay(row) {
  const at = timestamp(row.publishedAt);
  if (at !== null) return localDay(at);
  const day = row.publicationDate || row.publishedOn;
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && timestamp(day+'T00:00:00+08:00') !== null ? day : null;
}
function verified(row, now) {
  const published = timestamp(row.publishedAt), checked = timestamp(row.verifiedAt);
  const precise = published !== null ? published <= checked : publicationDay(row) !== null && publicationDay(row) <= localDay(checked || 0);
  const state = VERIFIED.has(row.status) || row.status === 'published_native_verified' && row.verified === true;
  return state && publicURL(row.url) && precise && checked !== null &&
    row.publicVerified !== false && checked <= now && typeof row.evidence === 'string' && row.evidence.length > 0 && row.evidenceFilePresent === true;
}
function matches(row, task) {
  if (row.channel !== task.channel) return false;
  const kind = row.kind || row.type;
  if (kind === 'non_promotional_method_exchange') return false;
  const features = row.featureIds || [];
  if (task.kind === 'radar_daily') return ['radar_daily_three_images','radar_daily_video'].includes(kind);
  if (task.kind === 'radar_daily_three_images') return kind === task.kind;
  if (task.kind === 'ak_daily_three_native_cards') return kind === 'three_native_images' ||
    kind === 'weibo_daily_three_native_cards_sync' ||
    (['ak-battle', 'ak-news', 'ak-limitup'].every(id => features.includes(id)) && !kind);
  return ['short_video','workstation_short','radar_daily_video'].includes(kind) || (!kind && /\/(shorts|video)\//.test(row.url || '') && !features.some(id => id.startsWith('ak-')));
}
function rowsFrom(receipts) {
  return receipts.flatMap(receipt => ['publiclyPublished', 'otherSubmissions', 'submittedUnavailable', 'pending']
    .flatMap(field => (receipt[field] || []).map(row => ({ ...row, receiptDate: receipt.date, sourceReceipt: receipt.sourceReceipt || null }))));
}
function dayTasks(day, contract) {
  const active = activeContract(day, contract);
  if (active) return active.daily.map(t => ({...t,id:`${day}:${t.kind}:${t.channel}`,date:day,notBefore:`${day}T${t.notBefore || '00:00:00'}+08:00`}));
  return [ ...['tiktok', 'youtube'].map(channel => ({ id: `${day}:short:${channel}`, date: day,
    channel, kind: 'workstation_short', notBefore: `${day}T00:00:00+08:00` })),
  ...AK_CHANNELS.map(channel => ({ id: `${day}:ak:${channel}`, date: day, channel,
    kind: 'ak_daily_three_native_cards', notBefore: `${day}T17:30:00+08:00` })),
  ...(day >= X_RADAR_DAILY_START ? [{ id: `${day}:radar:x`, date: day, channel: 'x',
    kind: 'radar_daily_three_images', notBefore: `${day}T00:00:00+08:00` }] : []) ];
}
function taskState(task, rows, now) {
  const candidates = rows.filter(row => matches(row, task) &&
    (publicationDay(row) === null ? row.receiptDate === task.date : publicationDay(row) === task.date));
  const complete = candidates.filter(row => verified(row, now) &&
    (!['radar_daily_three_images','radar_daily'].includes(task.kind) || (row.featureIds || []).some(id =>
      id === 'opensource-web' || id === 'ai-open-source-radar') &&
      (row.kind === 'radar_daily_video' ? /^[a-f0-9]{64}$/.test(row.sha256 || '') : Array.isArray(row.assets) && row.assets.length >= 3 && row.assets.length <= 4)) &&
    (task.kind !== 'ak_daily_three_native_cards' || timestamp(row.publishedAt) >= timestamp(task.notBefore)));
  const pending = candidates.filter(row => !complete.includes(row));
  const qualityBlocks = pending.filter(row => row.status === 'blocked_quality' &&
    row.submitted === false && row.evidenceFilePresent === true);
  const unresolved = pending.filter(row => !qualityBlocks.includes(row));
  let status = 'due', nextAction = 'prepare_and_execute_in_current_authorized_session';
  if (complete.length) { status = 'complete'; nextAction = 'measure_at_review_window'; }
  else if (unresolved.length) { status = 'needs_result_reconciliation'; nextAction = 'verify_existing_result_do_not_resubmit'; }
  else if (qualityBlocks.length) { status = 'blocked_quality'; nextAction = 'resolve_quality_issue_before_any_submit'; }
  else if (now < timestamp(task.notBefore)) { status = 'not_yet_due'; nextAction = 'continue_other_work_and_return_after_notBefore'; }
  else if (task.date < localDay(now)) { status = 'missed_day'; nextAction = 'record_unmet_day_do_not_backfill_or_republish_old_content'; }
  return { ...task, status, nextAction, verifiedURLs: [...new Set(complete.map(row => row.url))],
    unresolvedResults: unresolved.map(row => ({ url: row.url || null, status: row.status || 'unknown', sourceReceipt: row.sourceReceipt })),
    qualityBlocks: qualityBlocks.map(row => ({ reason: row.reason || null, evidence: row.evidence, sourceReceipt: row.sourceReceipt })),
    automaticPublish: false };
}
function executionPlan({ asOf, receipts, contract, automation={} }) {
  const now = timestamp(asOf);
  if (now === null) throw new Error('asOf must be a real ISO timestamp with explicit timezone');
  if (!Array.isArray(receipts)) throw new Error('receipts must be an array');
  const today = localDay(now), rows = rowsFrom(receipts), seen = new Set();
  const current = dayTasks(today, contract).map(task => taskState(task, rows, now));
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
  const scheduledChannels=automation.publisherTimerInstalled===true && automation.unattendedPublishingEnabled===true ? [...new Set((automation.validatedPublishChannels || []).filter(c=>['douyin','bilibili','tiktok','youtube','x'].includes(c)))] : [];
  return { asOf, timezone: 'Asia/Shanghai', date: today, readOnly: true, schedulerInstalled: automation.buildTimerInstalled===true || automation.publisherTimerInstalled===true,
    schedulerScope:scheduledChannels.length?(automation.buildTimerInstalled===true?'local_radar_creation_and_validated_publishers':'local_validated_publishers'):automation.buildTimerInstalled===true?'local_creation_only':'none',
    scheduledPublishingEnabled:scheduledChannels.length>0, scheduledPublishChannels:scheduledChannels, automationEvidence:'policy_configuration_not_live_systemd_probe',
    automaticPublish: false, planPerformsPublication:false, source: 'local_receipt_claims_with_existing_evidence_files_not_live_revalidation',
    current, pausedChannels:activeContract(today,contract)?.paused || [], unresolvedPublications:rows.filter(row=>!verified(row,now) && !['blocked_quality','not_published','rejected'].includes(row.status)).map(row=>({channel:row.channel,url:row.url || null,status:row.status})), unresolvedHistory, completedTasks: current.filter(task => task.status === 'complete').length,
    requiredTasks: current.length, complete: current.every(task => task.status === 'complete'),
    stalePendingRecords: unresolvedHistory.length,
    metrics: { humanVisitors: null, conversions: null },
    note: 'A local plan does not schedule background execution. Missing receipts do not prove no external action; reconcile reserved submissions before any first click.' };
}
module.exports = { executionPlan, timestamp, localDay };
