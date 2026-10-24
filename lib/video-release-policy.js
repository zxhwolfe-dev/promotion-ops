'use strict';
const fs = require('node:fs');
const path = require('node:path');

function resolveVideoQueue({ videoQueueFile, policyFile, defaultPolicyFile }) {
  if (videoQueueFile) return { file: path.resolve(videoQueueFile), source: 'explicit_queue', policyFile: null };
  const candidate = policyFile || defaultPolicyFile;
  if (!candidate || (!policyFile && !fs.existsSync(candidate))) return null;
  const info = fs.statSync(candidate);
  if (!info.isFile() || info.size > 4 * 1024 * 1024) throw new Error('Policy must be a regular file below 4 MiB');
  const policy = JSON.parse(fs.readFileSync(candidate, 'utf8'));
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new Error('Policy must be an object');
  if (!Object.hasOwn(policy, 'videoReleaseQueue')) return null;
  if (typeof policy.videoReleaseQueue !== 'string' || !policy.videoReleaseQueue.trim()) {
    throw new Error('Active policy videoReleaseQueue must name a queue file');
  }
  return { file: path.resolve(path.dirname(candidate), policy.videoReleaseQueue),
    source: 'current_policy', policyFile: path.resolve(candidate) };
}
module.exports = { resolveVideoQueue };
