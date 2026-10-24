'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { executionPlan } = require('../../lib/daily-execution');
const { reviewTasks } = require('../../lib/receipt-reviews');
const { videoReleasePlan, guardDailyVideoTasks } = require('../../lib/video-release-queue');
const { resolveVideoQueue } = require('../../lib/video-release-policy');
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
  const receipts = receiptFiles.map(file => {
    const info = fs.statSync(file);
    if (!info.isFile() || info.size > 4 * 1024 * 1024) throw new Error('Receipt must be a regular file below 4 MiB');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Receipt must be an object');
    data.sourceReceipt = path.resolve(file);
    for (const field of ['publiclyPublished', 'otherSubmissions', 'submittedUnavailable', 'pending']) {
      if (data[field] !== undefined && !Array.isArray(data[field])) throw new Error(`${field} must be an array`);
      for (const row of data[field] || []) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Receipt rows must be objects');
        row.evidenceFilePresent = false;
        const evidence = Array.isArray(row.evidence) ? row.evidence : [row.evidence];
        if (evidence.length && evidence.every(item => typeof item === 'string' && item.length)) {
          try { row.evidenceFilePresent = evidence.every(item => fs.statSync(path.resolve(path.dirname(file), item)).isFile()); } catch {}
          row.evidenceFiles = evidence;
          row.evidence = evidence[0];
        }
      }
    }
    return data;
  });
  let result = executionPlan({ asOf, receipts });
  const observations = snapshotFiles.flatMap(file => {
    const info = fs.statSync(file);
    if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new Error('Snapshot must be a regular file below 16 MiB');
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(snapshot.rows)) throw new Error('Snapshot rows must be an array');
    return snapshot.rows.flatMap(row => (row.observations || []).map(observation => {
      let evidenceFilePresent = false;
      if (typeof observation.evidence === 'string') {
        try { evidenceFilePresent = fs.statSync(path.resolve(path.dirname(file), observation.evidence)).isFile(); } catch {}
      }
      return { ...observation, channel: observation.channel || row.channel, evidenceFilePresent };
    }));
  });
  result.reviews = reviewTasks(receipts.flatMap(receipt => receipt.publiclyPublished || []), observations, Date.parse(asOf));
  const videoQueue = resolveVideoQueue({ videoQueueFile, policyFile, defaultPolicyFile });
  if (videoQueue) {
    const info = fs.statSync(videoQueue.file);
    if (!info.isFile() || info.size > 4 * 1024 * 1024) throw new Error('Video queue must be a regular file below 4 MiB');
    result.videoQueueSource = videoQueue;
    result.videoQueue = videoReleasePlan(JSON.parse(fs.readFileSync(videoQueue.file, 'utf8')), asOf);
    result = guardDailyVideoTasks(result, result.videoQueue);
  }
  return { result, exitCode: strict && !result.complete ? 2 : 0 };
}
if (require.main === module) {
  try { const { result, exitCode } = main(); console.log(JSON.stringify(result, null, 2)); process.exitCode = exitCode; }
  catch (error) { console.error(`daily-execution-plan: ${error.message}`); process.exitCode = 1; }
}
module.exports = { main };
