'use strict';
// Local planning only. No network, browser, publication, or ledger writes.
const fs = require('node:fs');
const DAY = 86400000;
const MANUAL = new Set(['wechat', 'wechatofficial', 'wechatofficialaccount', 'wechatmp',
  'wechatchannels', 'wechatvideo', 'weixin', 'weixinchannels', 'douyin',
  '微信公众号', '微信视频号', '视频号', '抖音']);

function fail(message) { throw new Error(message); }
function timestamp(value, field, nullable = false) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string') fail(`${field} must be an ISO timestamp with timezone`);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) fail(`${field} must be an ISO timestamp with timezone`);
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const zone = m[7], zoneHour = zone === 'Z' ? 0 : Number(zone.slice(1, 3));
  const zoneMinute = zone === 'Z' ? 0 : Number(zone.slice(4, 6));
  if (!year || month < 1 || month > 12 || day < 1 || day > days[month - 1] ||
      hour > 23 || minute > 59 || second > 59 || zoneHour > 14 || zoneMinute > 59 ||
      (zoneHour === 14 && zoneMinute !== 0) || !Number.isFinite(Date.parse(value))) fail(`${field} is invalid`);
  return Date.parse(value);
}

function reviewPlan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Expected a ledger object');
  const asOf = timestamp(input.asOf, 'asOf');
  if (!Array.isArray(input.channels)) fail('channels must be an array');
  const result = { asOf: new Date(asOf).toISOString(), readOnly: true,
    overdue: [], due: [], blocked: [], manualOnly: [], notDue: [] };
  const ids = new Set();
  for (const channel of input.channels) {
    if (!channel || typeof channel !== 'object' || Array.isArray(channel)) fail('Invalid channel');
    const { id, platform, mode, reviewEveryDays, lastCheckStatus, publicationStatus } = channel;
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)) fail('Invalid channel id');
    if (ids.has(id)) fail(`Duplicate channel id: ${id}`);
    ids.add(id);
    if (typeof platform !== 'string' || !platform.trim() || platform.length > 80) fail(`${id}: platform is required`);
    if (!['active', 'paused', 'disabled', 'manualOnly'].includes(mode)) fail(`${id}: invalid mode`);
    if (!Number.isInteger(reviewEveryDays) || reviewEveryDays < 1 || reviewEveryDays > 3650) fail(`${id}: invalid reviewEveryDays`);
    if (!['complete', 'partial', 'not_checked'].includes(lastCheckStatus)) fail(`${id}: invalid lastCheckStatus`);
    if (![null, undefined, 'none', 'published', 'submitted', 'pending', 'unknown'].includes(publicationStatus)) fail(`${id}: invalid publicationStatus`);
    const last = timestamp(channel.lastCheckedAt, `${id}.lastCheckedAt`, true);
    const complete = timestamp(channel.lastCompleteCheckAt ?? null, `${id}.lastCompleteCheckAt`, true);
    if ((last !== null && last > asOf) || (complete !== null && complete > asOf)) fail(`${id}: future check timestamp`);
    if (lastCheckStatus === 'complete' && last === null) fail(`${id}: complete review needs lastCheckedAt`);
    if (last !== null && complete !== null && complete > last) fail(`${id}: complete watermark is newer than latest check`);
    if (channel.blockedReason !== undefined && channel.blockedReason !== null &&
        (typeof channel.blockedReason !== 'string' || !channel.blockedReason.trim())) fail(`${id}: invalid blockedReason`);
    // Partial or unperformed checks never advance the last complete watermark.
    const watermark = lastCheckStatus === 'complete' ? last : complete;
    const dueAt = watermark === null ? null : watermark + reviewEveryDays * DAY;
    const entry = { id, platform, mode, reviewEveryDays, lastCheckStatus,
      lastVerifiedCheckAt: watermark === null ? null : new Date(watermark).toISOString(),
      dueAt: dueAt === null ? null : new Date(dueAt).toISOString(),
      publicationStatus: publicationStatus ?? null, automaticPublish: false };
    const normalized = value => value.toLowerCase().replace(/[\s_-]/g, '');
    if (mode === 'manualOnly' || MANUAL.has(normalized(platform)) || MANUAL.has(normalized(id))) {
      result.manualOnly.push({ ...entry, reason: 'manual_only', nextAction: 'user_decides', automaticOperation: false });
    } else if (mode === 'paused' || mode === 'disabled') {
      result.blocked.push({ ...entry, reason: mode, nextAction: 'keep_current_state', automaticOperation: false });
    } else if (publicationStatus === 'unknown') {
      result.blocked.push({ ...entry, reason: 'unknown_publication_result', nextAction: 'verify_remote_result', automaticOperation: 'read_only_verification' });
    } else if (channel.blockedReason) {
      result.blocked.push({ ...entry, reason: channel.blockedReason, nextAction: 'resolve_recorded_blocker', automaticOperation: false });
    } else {
      const key = dueAt === null || dueAt === asOf ? 'due' : dueAt < asOf ? 'overdue' : 'notDue';
      result[key].push({ ...entry, reason: watermark === null ? 'no_complete_review' : key,
        nextAction: key === 'notDue' ? 'wait_until_due' : 'review_channel', automaticOperation: 'review_only' });
    }
  }
  return result;
}

function main(args = process.argv.slice(2)) {
  if (args.length !== 1) fail('Usage: channel-review-plan.js <local-ledger.json>');
  const stat = fs.statSync(args[0]);
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) fail('Input must be a local JSON file smaller than 2 MiB');
  return reviewPlan(JSON.parse(fs.readFileSync(args[0], 'utf8')));
}
if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(main(), null, 2)}\n`); }
  catch (error) { process.stderr.write(`channel-review-plan: ${error.message}\n`); process.exitCode = 1; }
}
module.exports = Object.assign(main, { reviewPlan, main });
