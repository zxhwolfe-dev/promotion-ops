'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { executionPlan } = require('../../lib/daily-execution');
const { reviewTasks, reviewsDueNow } = require('../../lib/receipt-reviews');
const { videoReleasePlan, guardDailyVideoTasks } = require('../../lib/video-release-queue');
const { resolveVideoQueue } = require('../../lib/video-release-policy');
const REVIEW_HISTORY_DAYS = 14;
const DAY_MS = 86_400_000;

function readObject(file, limit, label) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > limit * 1024 * 1024) {
    throw Error(`${label} must be a regular file below ${limit} MiB`);
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error(`${label} must be an object`);
  return data;
}

function evidenceFor(source, evidence) {
  const files = Array.isArray(evidence) ? evidence : [evidence];
  if (!files.length || files.some(file => typeof file !== 'string' || !file.length)) {
    return { evidenceFilePresent: false };
  }
  const resolved = files.map(file => path.resolve(path.dirname(source), file));
  let evidenceFilePresent = false;
  try { evidenceFilePresent = resolved.every(file => fs.statSync(file).isFile()); } catch {}
  return { evidenceFilePresent, evidenceFiles: files, evidence: files[0] };
}

function readReceipt(file, day) {
  const data = readObject(file, 4, 'Receipt');
  if (day && data.date !== day) throw Error('Archived receipt date differs from its directory');
  data.sourceReceipt = path.resolve(file);
  for (const field of ['publiclyPublished', 'otherSubmissions', 'submittedUnavailable', 'pending']) {
    if (data[field] !== undefined && !Array.isArray(data[field])) throw Error(`${field} must be an array`);
    for (const row of data[field] || []) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('Receipt rows must be objects');
      Object.assign(row, evidenceFor(file, row.evidence));
    }
  }
  return data;
}

function readSnapshot(file, day) {
  const snapshot = readObject(file, 16, 'Snapshot');
  if (day && snapshot.date !== day) throw Error('Archived snapshot date differs from its filename');
  if (!Array.isArray(snapshot.rows)) throw Error('Snapshot rows must be an array');
  return snapshot.rows.flatMap(row => (row.observations || []).map(observation => ({
    ...observation, channel: observation.channel || row.channel, ...evidenceFor(file, observation.evidence),
  })));
}

function recentReviewHistory(day, receiptFile, snapshotFile) {
  const receipts = [], observations = [], issues = [];
  if (!receiptFile || !snapshotFile) return { receipts, observations, issues };
  const followupDir = path.dirname(receiptFile);
  if (path.basename(receiptFile) !== 'publication-results.json' ||
      !/^\d{4}-\d{2}-\d{2}-promotion-followup$/.test(path.basename(followupDir)) ||
      !/^\d{4}-\d{2}-\d{2}\.json$/.test(path.basename(snapshotFile))) return { receipts, observations, issues };
  const epoch = Date.parse(day + 'T00:00:00Z');
  // Keep posts whose seven-day review can fall in the last week.
  for (let prior = 0; prior <= REVIEW_HISTORY_DAYS; prior++) {
    const date = new Date(epoch - prior * DAY_MS).toISOString().slice(0, 10);
    const receipt = path.join(path.dirname(followupDir), date + '-promotion-followup', 'publication-results.json');
    const snapshot = path.join(path.dirname(snapshotFile), date + '.json');
    if (receipt !== receiptFile && fs.existsSync(receipt)) {
      try { receipts.push(readReceipt(receipt, date)); }
      catch (error) { issues.push({ file: receipt, reason: error.message }); }
    }
    if (snapshot !== snapshotFile && fs.existsSync(snapshot)) {
      try { observations.push(...readSnapshot(snapshot, date)); }
      catch (error) { issues.push({ file: snapshot, reason: error.message }); }
    }
  }
  return { receipts, observations, issues };
}

function readLatestReadback(file, publications) {
  const report = readObject(file, 16, 'Readback');
  if (report.scope !== 'readback_only_existing_posts' || !Array.isArray(report.observations)) {
    throw Error('Expected readback of existing posts');
  }
  const aituUrls = new Set(publications.filter(receipt => receipt.channel === 'youtube' &&
    receipt.kind === 'aitu_image_and_prompt' && receipt.evidenceFilePresent).map(receipt => receipt.url));
  return report.observations.map(row => ({
    channel: row.channel === 'aitu-youtube' && aituUrls.has(row.url) ? 'youtube' : row.channel,
    url: row.url, observedAt: row.observedAt, metrics: row.metrics,
    scope: 'single_content', windowType: 'cumulative', publicationStatus: row.status,
    ...evidenceFor(file, row.evidence),
  }));
}

function main(args = process.argv.slice(2), { defaultPolicyFile = path.resolve(__dirname, '../../../promotion-current-policy.json') } = {}) {
  const receiptFiles = [], snapshotFiles = []; let asOf, strict = false, videoQueueFile, policyFile;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--as-of') asOf = args[++i];
    else if (args[i] === '--receipt' && args[i + 1]) receiptFiles.push(args[++i]);
    else if (args[i] === '--snapshot' && args[i + 1]) snapshotFiles.push(args[++i]);
    else if (args[i] === '--strict') strict = true;
    else if (args[i] === '--video-queue' && args[i + 1]) videoQueueFile = args[++i];
    else if (args[i] === '--policy' && args[i + 1]) policyFile = args[++i];
    else throw new Error('Usage: daily-execution-plan.js --as-of <ISO timestamp> [--receipt <publication-results.json>]... [--snapshot <daily.json>]... [--policy <policy.json>] [--video-queue <release-queue.json>] [--strict]');
  }
  const activePolicyFile = policyFile || (videoQueueFile ? null : defaultPolicyFile);
  const configuredPolicy = activePolicyFile && (policyFile || fs.existsSync(activePolicyFile))
    ? readObject(activePolicyFile, 4, 'Policy') : {};
  const policyPath = file => path.resolve(path.dirname(activePolicyFile), file);
  const useHistory = !receiptFiles.length && !snapshotFiles.length;
  if (!receiptFiles.length && configuredPolicy.currentRun) receiptFiles.push(policyPath(configuredPolicy.currentRun));
  if (!snapshotFiles.length && configuredPolicy.latestDailyMetrics) snapshotFiles.push(policyPath(configuredPolicy.latestDailyMetrics));
  const receipts = receiptFiles.map(file => readReceipt(file));
  let result = executionPlan({ asOf, receipts, contract:configuredPolicy.activeContract });
  const observations = snapshotFiles.flatMap(file => readSnapshot(file));
  const history = useHistory ? recentReviewHistory(result.date, receiptFiles[0], snapshotFiles[0]) :
    { receipts: [], observations: [], issues: [] };
  const publications = [...receipts, ...history.receipts]
    .flatMap(receipt => [...(receipt.publiclyPublished || []), ...(receipt.otherSubmissions || [])]);
  if (configuredPolicy.latestReadback) {
    try {
      observations.push(...readLatestReadback(policyPath(configuredPolicy.latestReadback), publications));
    } catch (error) {
      result.readbackIssue = error.message;
    }
  }
  const now = Date.parse(asOf);
  result.reviews = reviewTasks(publications, [...observations, ...history.observations], now);
  result.reviewsDueNow = reviewsDueNow(result.reviews, now);
  if (history.issues.length) result.reviewHistoryIssues = history.issues;
  const videoQueue = resolveVideoQueue({ videoQueueFile, policyFile, defaultPolicyFile });
  if (videoQueue) {
    const info = fs.statSync(videoQueue.file);
    if (!info.isFile() || info.size > 4 * 1024 * 1024) throw new Error('Video queue must be a regular file below 4 MiB');
    result.videoQueueSource = videoQueue;
    result.videoQueue = videoReleasePlan(JSON.parse(fs.readFileSync(videoQueue.file, 'utf8')), asOf);
    result = guardDailyVideoTasks(result, result.videoQueue);
  }
  // Channel maintenance remains active even when no video queue is configured.
  if (configuredPolicy.channelRegistry !== undefined) {
    if (typeof configuredPolicy.channelRegistry !== 'string' || !configuredPolicy.channelRegistry.trim()) {
      throw Error('channelRegistry must name a local registry');
    }
    const registryFile = policyPath(configuredPolicy.channelRegistry);
    result.channelMaintenance = require('../../lib/channel-maintenance').loadChannelMaintenance({ registryFile, observations, asOf });
  }
  return { result, exitCode: strict && !result.complete ? 2 : 0 };
}
if (require.main === module) {
  try { const { result, exitCode } = main(); console.log(JSON.stringify(result, null, 2)); process.exitCode = exitCode; }
  catch (error) { console.error(`daily-execution-plan: ${error.message}`); process.exitCode = 1; }
}
module.exports = { main };
