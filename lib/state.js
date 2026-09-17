'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { OpsError, redact, trustedURL } = require('./ops');
const hash = value => createHash('sha256').update(value).digest('hex');
const stateDir = () => path.resolve(process.env.PROMO_STATE_DIR || path.join(os.homedir(), '.promotion-ops'));
async function privateDir(name) {
  const root = stateDir();
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(root)).isSymbolicLink()) throw new OpsError('UNSAFE_STATE_DIR', '状态根目录不能是符号链接');
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(dir)).isSymbolicLink()) throw new OpsError('UNSAFE_STATE_DIR', '状态目录不能是符号链接');
  return dir;
}
async function withLock(key, fn) {
  const file = path.join(await privateDir('locks'), `${hash(key)}.lock`);
  const nonce = randomUUID();
  let handle;
  try { handle = await fs.open(file, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new OpsError('BUSY', '资源正在使用或存在崩溃遗留锁；确认没有进程和未核验写操作后再人工处理', 4, { lockFile: file });
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, host: os.hostname(), nonce, createdAt: new Date().toISOString() }));
    await handle.sync();
    return await fn();
  } finally {
    // 清理异常不能覆盖业务异常或已经核验的结果；损坏锁保留供人工检查。
    try {
      await handle.close();
      const owner = JSON.parse(await fs.readFile(file, 'utf8'));
      if (owner.nonce === nonce) await fs.unlink(file);
    } catch (error) {
      console.error(redact(JSON.stringify({ status: 'warning', code: 'LOCK_CLEANUP_FAILED', message: error.message })));
    }
  }
}
async function writeJSON(file, data) {
  const directory = path.dirname(file);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temp, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(data, null, 2) + '\n');
    await handle.sync();
    await handle.close(); handle = null;
    await fs.rename(temp, file);
    // POSIX: sync the rename as well as file content. Windows lacks this directory API.
    // This strengthens local persistence; it is not a cross-filesystem transaction.
    if (process.platform !== 'win32') {
      const parent = await fs.open(directory, 'r');
      try { await parent.sync(); } finally { await parent.close(); }
    }
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.rm(temp, { force: true });
  }
}
async function readRecord(file) {
  try {
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024) {
      throw new OpsError('UNSAFE_RECORD', '状态文件必须是有限大小的普通文件，不能跟随符号链接', 2);
    }
    const record = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new OpsError('INVALID_RECORD', '状态文件不是有效对象，不能当作记录缺失', 2);
    return record;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const STATES = new Set(['prepared', 'submitted', 'unknown', 'needs_human', 'verified', 'failed_before_submit', 'retry_authorized']);
function validEvidence(result) {
  return result?.status === 'verified' && result.evidence && !Array.isArray(result.evidence) &&
    typeof result.evidence === 'object' && typeof result.evidence.kind === 'string' && !!result.evidence.kind;
}
function validateRecord(record, operationId) {
  if (!record || Array.isArray(record) || record.operationId !== operationId || typeof record.kind !== 'string' ||
      !STATES.has(record.status) || (record.status === 'verified' && !validEvidence(record.result))) {
    throw new OpsError('INVALID_OPERATION_RECORD', '台账结构或证据损坏；停止执行并人工核对，不删除记录', 2, { operationId });
  }
  return record;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
async function writeOnce(intent, operation) {
  const operationId = hash(JSON.stringify(canonical(intent)));
  return withLock(`operation:${operationId}`, async () => {
    const file = path.join(await privateDir('operations'), `${operationId}.json`);
    const previous = await readRecord(file);
    if (previous) validateRecord(previous, operationId);
    if (previous?.status === 'verified') return { ...previous.result, status: 'already_verified', operationId };
    if (previous && !['failed_before_submit', 'retry_authorized'].includes(previous.status)) {
      throw new OpsError('RECONCILE_REQUIRED', '已有未核验操作，禁止自动重发；请先独立检查远端结果', 2, { operationId, state: previous.status });
    }
    const record = { operationId, kind: intent.kind, status: 'prepared', startedAt: new Date().toISOString(), reviews: previous?.reviews || [] };
    await writeJSON(file, record); // 只记录摘要，不落盘正文、收件人、token。
    let submitted = false, reserved = false, closed = false, pending;
    const submit = action => {
      if (closed) return Promise.reject(new OpsError('LATE_SUBMIT', '操作已结束，拒绝延迟提交', 2));
      if (reserved) return Promise.reject(new OpsError('DOUBLE_SUBMIT', '一个操作只允许提交一次', 2));
      if (typeof action !== 'function') return Promise.reject(new OpsError('INVALID_SUBMIT', '提交动作必须是函数'));
      reserved = true; // BEFORE the first await: concurrent calls cannot both enter.
      pending = (async () => {
        record.status = 'submitted';
        record.submittedAt = new Date().toISOString();
        await writeJSON(file, record); // Durable intent BEFORE any external side effect.
        submitted = true;
        return action();
      })();
      pending.catch(() => {}); // Also observed below if the callback forgets to await.
      return pending;
    };
    try {
      const result = await operation({ operationId, submit });
      closed = true;
      if (pending) await pending; // Never release the operation lock while submission is running.
      if (!submitted || !validEvidence(result)) {
        throw new OpsError('UNVERIFIED', '提交未取得独立验证证据；不能报告成功', 2);
      }
      record.status = 'verified';
      record.result = { ...result, operationId };
      record.verifiedAt = new Date().toISOString();
      await writeJSON(file, record);
      return record.result;
    } catch (cause) {
      closed = true;
      if (pending) await pending.catch(() => {});
      const error = cause instanceof Error ? cause : new OpsError('UNEXPECTED_ERROR', '操作抛出了非 Error 异常');
      record.status = submitted ? (error.exitCode === 3 ? 'needs_human' : 'unknown') : 'failed_before_submit';
      record.errorCode = error.code || 'UNEXPECTED_ERROR';
      try { await writeJSON(file, record); } catch { /* submitted/prepared 原记录仍会阻止重发。 */ }
      if (submitted) { error.preservePage = true; if (error.exitCode !== 3) error.exitCode = 2; }
      error.details = { ...error.details, operationId, state: record.status };
      throw error;
    }
  });
}

async function reconcile(operationId, decision, evidenceUrl, confirmed = false) {
  if (!/^[a-f0-9]{64}$/.test(operationId)) throw new OpsError('INVALID_OPERATION_ID', 'operationId 必须是 64 位摘要');
  return withLock(`operation:${operationId}`, async () => {
    const file = path.join(await privateDir('operations'), `${operationId}.json`);
    const record = await readRecord(file);
    if (!record) throw new OpsError('OPERATION_NOT_FOUND', '操作记录不存在');
    validateRecord(record, operationId);
    if (!decision) return { status: 'ok', record };
    if (!confirmed || !['verified', 'not-written'].includes(decision)) throw new OpsError('MANUAL_CONFIRMATION_REQUIRED', '必须独立检查远端结果，并显式提供确认标志');
    if (record.status === 'verified') throw new OpsError('ALREADY_VERIFIED', '已核验记录不可通过此命令重置');
    const hosts = { gmail: ['mail.google.com'], reddit: ['old.reddit.com', 'www.reddit.com'], tencent: ['cloud.tencent.com'], aliyun: ['developer.aliyun.com'], csdn: ['blog.csdn.net', 'mp.csdn.net'], oschina: ['my.oschina.net'], baidu: ['ziyuan.baidu.com'] };
    const url = trustedURL(evidenceUrl, hosts[record.kind.split('.')[0]] || []);
    if (url.search) throw new OpsError('UNSAFE_EVIDENCE_URL', '人工核验链接不能包含查询参数或 token');
    const review = { decision, reviewedAt: new Date().toISOString(), evidenceUrl: url.href, previousState: record.status, mode: 'operator_attested_not_automatically_verified' };
    record.reviews = [...(record.reviews || []), review];
    if (decision === 'verified') {
      record.status = 'verified'; record.result = { status: 'verified', operationId, evidence: { kind: 'manual_independent_readback', ...review } };
    } else record.status = 'retry_authorized';
    await writeJSON(file, record);
    return { status: 'ok', operationId, state: record.status, review }; // 不会自动点击或发起 POST。
  });
}
module.exports = { hash, stateDir, withLock, writeJSON, readRecord, writeOnce, reconcile, validateRecord };
