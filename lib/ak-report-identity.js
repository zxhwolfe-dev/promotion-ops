'use strict';
const { createHash } = require('node:crypto');
const { timestamp } = require('./daily-execution');
const IDS = new Set(['battle', 'domestic-news', 'limitup']);

// One channel may use a dated report edition once. Re-encoding is not new content.
function reportIdentity(report) {
  const meta = report?.reportMetadata || report;
  if (!meta || !IDS.has(meta.id) || timestamp(`${meta.reportDate}T00:00:00+08:00`) === null) return null;
  const edition = meta.id === 'domestic-news' ? meta.edition : 'postclose';
  if (!['postclose', 'morning', 'evening'].includes(edition)) return null;
  return `ak:${meta.id}:${meta.reportDate}:${edition}`;
}
function reportContentHash(report) {
  const text = typeof report?.cardText === 'string'
    ? report.cardText.normalize('NFKC').replace(/[\u200b-\u200f\ufeff]/g, '').replace(/\s+/g, ' ').trim() : '';
  return text.length >= 80 ? createHash('sha256').update(text).digest('hex') : null;
}
function historyContentHash(record) {
  return /^[a-f0-9]{64}$/.test(record?.reportContentSha256 || '')
    ? record.reportContentSha256 : reportContentHash(record);
}
module.exports = { reportIdentity, reportContentHash, historyContentHash };
