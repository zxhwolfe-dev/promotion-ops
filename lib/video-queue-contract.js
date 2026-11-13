'use strict';
const {timestamp, localDay} = require('./daily-execution');
const CHANNELS = new Set(['tiktok','youtube','bilibili','douyin','x']);
const PUBLISHED = new Set(['published','published_native_verified','copied']);
const UNCERTAIN = new Set(['reserved','submitted','unknown','uploaded','pending_review',
  'submitted_requires_native_readback','uploaded_native_checks_pending','prepared_native','reserved_before_upload','unknown_upload_reconcile_only','submitted_reconcile_only','unknown_reconcile_only','restricted_not_public',
  'published_native_verified_external_unknown','unknown_pre_submit_editor_closed_reconcile_only']);
function calendarDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    timestamp(value+'T00:00:00+08:00') !== null ? value : null;
}
function queueDate(item) {
  const scheduled = timestamp(item.publishAt), published = timestamp(item.publishedAt);
  return calendarDay(item.publicationDate) || calendarDay(item.publishedOn) ||
    (scheduled === null ? null : localDay(scheduled)) || (published === null ? null : localDay(published));
}
function validateItem(item) {
  if (!item.id || !CHANNELS.has(item.channel) || !Number.isInteger(item.episode) || item.episode < 1 ||
      !queueDate(item) || (item.publishAt != null && timestamp(item.publishAt) === null) ||
      !/^[a-f0-9]{64}$/.test(item.sha256 || '')) throw Error('Invalid video queue identity, channel, timestamp or SHA');
  // Source snapshots never establish intended publication day or publication time.
  if (item.status === 'scheduled_native_verified' && timestamp(item.publishAt) === null) throw Error('Native schedule requires exact publishAt');
}
function queueCounts(items) {
  const byStatus = {};
  for (const item of items) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  return {total:items.length,byStatus};
}
module.exports = {CHANNELS,PUBLISHED,UNCERTAIN,calendarDay,queueDate,validateItem,queueCounts};
