'use strict';
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { timestamp, localDay } = require('./daily-execution');
const { reportIdentity, reportContentHash, historyContentHash } = require('./ak-report-identity');
const IDS = ['battle', 'domestic-news', 'limitup'];
function checkAKPackage(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a package object');
  const errors = [], checks = [], add = (code, id) => errors.push({ code, ...(id ? { id } : {}) });
  const now = timestamp(input.asOf);
  if (now === null) throw new Error('asOf must have explicit timezone and a real date');
  const today = localDay(now), due = timestamp(`${today}T17:30:00+08:00`);
  if (now < due) add('BEFORE_1730');
  if (input.publicationDate !== today) add('PUBLICATION_DATE_NOT_TODAY');
  if (!['weibo', 'toutiao', 'xueqiu', 'taoguba', 'baijiahao', 'x', 'tiktok'].includes(input.channel)) add('DESTINATION_CHANNEL_REQUIRED');
  if (!Array.isArray(input.previousUses)) add('MEDIA_HISTORY_REQUIRED');
  if (typeof input.tradingDay !== 'boolean') add('TRADING_DAY_NOT_VERIFIED');
  if (typeof input.caption !== 'string' || !input.caption.trim()) add('CAPTION_REQUIRED');
  if (/(?:akaiagents\s*[.．。]\s*com|aiworkstation\s*[.．。]\s*cn|useaistation\s*[.．。]\s*com)/i.test(input.caption || '')) add('CAPTION_PRODUCT_LINK');
  if (!Array.isArray(input.reports) || input.reports.length !== 3) add('EXACTLY_THREE_NATIVE_REPORTS_REQUIRED');
  const seen = new Set(), hashes = new Set();
  for (const report of Array.isArray(input.reports) ? input.reports : []) {
    if (!report || typeof report !== 'object') { add('REPORT_INVALID'); continue; }
    const id = report.id;
    if (!IDS.includes(id) || seen.has(id)) { add('REPORT_ID_INVALID_OR_REPEATED', id); continue; }
    seen.add(id);
    const reportAt = timestamp(report.reportAt), downloaded = timestamp(report.downloadedAt);
    if (report.complete !== true || report.visuallyVerified !== true || report.nativeDownload !== true) add('NATIVE_CONTENT_NOT_VERIFIED', id);
    const dayOnly = id === 'limitup' && report.reportTimePrecision === 'day' && report.reportAt === null && timestamp(`${report.reportDate}T00:00:00+08:00`) !== null;
    if (!dayOnly && (reportAt === null || reportAt > now || localDay(reportAt) !== report.reportDate)) add('REPORT_TIME_UNVERIFIED', id);
    if (downloaded === null || downloaded < due || downloaded > now || (reportAt !== null && downloaded < reportAt)) add('DOWNLOAD_NOT_AFTER_READY_TIME', id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(report.reportDate || '') || report.reportDate > today) add('REPORT_DATE_INVALID', id);
    if (input.tradingDay === true && report.reportDate !== today) add('STALE_TRADING_DAY_REPORT', id);
    if (input.tradingDay === false && report.reportDate !== today &&
      !(input.caption || '').includes(report.reportDate)) add('HISTORICAL_DATE_NOT_DISCLOSED_IN_CAPTION', id);
    if (id === 'domestic-news') {
      if (!['morning', 'evening'].includes(report.edition)) add('NEWS_EDITION_REQUIRED', id);
      const earliest = timestamp(`${report.reportDate}T${report.edition === 'evening' ? '19:30' : '07:30'}:00+08:00`);
      if (earliest === null || reportAt === null || reportAt < earliest || now < earliest ||
        (report.edition === 'morning' && reportAt >= timestamp(`${report.reportDate}T19:30:00+08:00`))) add('NEWS_EDITION_TIME_MISMATCH', id);
    }
    try {
      const source = new URL(report.sourceUrl);
      if (source.protocol !== 'https:' || source.hostname !== 'akaiagents.com' || source.username || source.password ||
        !/^\/share-images\//.test(source.pathname)) add('UNVERIFIED_NATIVE_SOURCE_URL', id);
    } catch { add('UNVERIFIED_NATIVE_SOURCE_URL', id); }
    try {
      const stat = fs.statSync(report.path);
      if (!stat.isFile() || stat.size > 30 * 1024 * 1024) throw new Error('Invalid file');
      const bytes = fs.readFileSync(report.path), hash = createHash('sha256').update(bytes).digest('hex');
      if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) add('NOT_NATIVE_PNG', id);
      if (report.sha256 !== hash) add('HASH_MISMATCH', id);
      if (hashes.has(hash)) add('DUPLICATE_CARD', id);
      hashes.add(hash);
      const prior = (Array.isArray(input.previousUses) ? input.previousUses : []).filter(use => use.sha256 === hash && use.channel === input.channel);
      if (prior.length) add('ASSET_ALREADY_RESERVED_OR_USED_ON_CHANNEL', id);
      const identity = reportIdentity(report), contentHash = reportContentHash(report);
      const sameChannel = (Array.isArray(input.previousUses) ? input.previousUses : []).filter(use => use.channel === input.channel);
      if (identity && sameChannel.some(use => reportIdentity(use) === identity)) add('REPORT_EDITION_ALREADY_RESERVED_OR_USED_ON_CHANNEL', id);
      if (contentHash && sameChannel.some(use => historyContentHash(use) === contentHash)) add('REPORT_CONTENT_ALREADY_RESERVED_OR_USED_ON_CHANNEL', id);
      checks.push({ id, sha256: hash, bytes: stat.size, reportDate: report.reportDate, edition: report.edition || null,
        reportIdentity: identity, reportContentSha256: contentHash,
        reportMetadata: { id, reportDate: report.reportDate, reportAt: report.reportAt, edition: report.edition || null } });
    } catch { add('UNREADABLE_MEDIA_FILE', id); }
  }
  return { readOnly: true, status: errors.length ? 'blocked' : 'ready_for_authorized_native_publish', asOf: input.asOf,
    publicationDate: input.publicationDate, channel: input.channel || null, errors, checks,
    automaticPublish: false, note: 'Metadata/visual verification claims remain operator evidence; passing is not publication, platform permission, or financial-result verification.' };
}
module.exports = { checkAKPackage };
