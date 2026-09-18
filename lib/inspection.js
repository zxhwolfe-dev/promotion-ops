'use strict';
// Local, read-only diagnostics. Never connects to Chrome, removes locks, or reconciles writes.
const fs = require('node:fs/promises');
const path = require('node:path');
const { stateDir, readRecord, validateRecord } = require('./state');
const { OpsError } = require('./ops');
const pendingStates = new Set(['prepared', 'submitted', 'unknown', 'needs_human']);
async function directoryEntries(directory) {
  try {
    const info = await fs.lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new OpsError('UNSAFE_STATE_DIR', '检查目录必须为真实目录，不跟随链接');
    return await fs.readdir(directory);
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function inspectState({ all = false, limit = 100 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new OpsError('INVALID_LIMIT', 'limit 必须为 1–1000');
  const root = stateDir();
  await directoryEntries(root); // Refuse a linked state root; don't create a missing one.
  const names = (await directoryEntries(path.join(root, 'operations'))).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).sort();
  const operations = [], errors = [], counts = {};
  for (const name of names.slice(0, 10000)) {
    const id = name.slice(0, -5);
    try {
      const record = validateRecord(await readRecord(path.join(root, 'operations', name)), id);
      counts[record.status] = (counts[record.status] || 0) + 1;
      if (all || pendingStates.has(record.status)) operations.push({ operationId: id, kind: record.kind, state: record.status,
        startedAt: record.startedAt || null, submittedAt: record.submittedAt || null, errorCode: record.errorCode || null });
    } catch (error) { errors.push({ operationId: id, code: error.code || 'INVALID_OPERATION_RECORD' }); }
  }
  operations.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  const lockNames = (await directoryEntries(path.join(root, 'locks'))).filter(name => /^[a-f0-9]{64}\.lock$/.test(name)).sort();
  const locks = [];
  for (const name of lockNames.slice(0, limit)) {
    try {
      const record = await readRecord(path.join(root, 'locks', name));
      if (!record) continue; // The owner may have released it during this read-only scan.
      if (!Number.isInteger(record.pid) || record.pid <= 0 || typeof record.host !== 'string' || typeof record.createdAt !== 'string') throw new Error('Invalid lock');
      locks.push({ lockFile: path.join(root, 'locks', name), pid: record.pid, host: record.host, createdAt: record.createdAt,
        liveness: 'not_checked', recovery: 'inspect_owner_and_remote_result_no_automatic_unlock' });
    } catch { errors.push({ lockFile: name, code: 'INVALID_LOCK_RECORD' }); }
  }
  const truncated = names.length > 10000 || operations.length > limit || lockNames.length > limit || errors.length > limit;
  return { status: errors.length || truncated ? 'partial' : 'ok', stateDirectory: root, collectedAt: new Date().toISOString(),
    readOnly: true, consistency: 'point_in_time_scan_not_transactional', remoteVerified: false,
    counts, pendingCount: Object.entries(counts).filter(([state]) => pendingStates.has(state)).reduce((sum, [, count]) => sum + count, 0),
    operations: operations.slice(0, limit), locks, errors: errors.slice(0, limit), truncated,
    note: '只列本地摘要；锁龄不能证明进程死亡，台账缺失不能证明远端未写入。本命令不解锁、不重发、不自动核验。' };
}
module.exports = { inspectState };
