'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { OpsError, redact, trustedURL } = require('./ops');
const hash = value => createHash('sha256').update(value).digest('hex');
const stateDir = () => path.resolve(process.env.PROMO_STATE_DIR || path.join(os.homedir(), '.promotion-ops'));
async function privateDir(name) {
  const dir = path.join(stateDir(), name);
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
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(data, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  try { await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }); }
}
async function readRecord(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
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
    if (previous?.status === 'verified') return { ...previous.result, status: 'already_verified', operationId };
    if (previous && !['failed_before_submit', 'retry_authorized'].includes(previous.status)) {
      throw new OpsError('RECONCILE_REQUIRED', '已有未核验操作，禁止自动重发；请先独立检查远端结果', 2, { operationId, state: previous.status });
    }
    const record = { operationId, kind: intent.kind, status: 'prepared', startedAt: new Date().toISOString(), reviews: previous?.reviews || [] };
    await writeJSON(file, record); // 只记录摘要，不落盘正文、收件人、token。
    let submitted = false;
    try {
      const result = await operation({ operationId, submit: async action => {
        if (submitted) throw new OpsError('DOUBLE_SUBMIT', '一个操作只允许提交一次', 2);
        record.status = 'submitted';
        record.submittedAt = new Date().toISOString();
        await writeJSON(file, record); // 必须先持久化，后产生外部副作用。
        submitted = true;
        return action();
      } });
      if (!submitted || result?.status !== 'verified' || !result.evidence) {
        throw new OpsError('UNVERIFIED', '提交未取得独立验证证据；不能报告成功', 2);
      }
      record.status = 'verified';
      record.result = { ...result, operationId };
      record.verifiedAt = new Date().toISOString();
      await writeJSON(file, record);
      return record.result;
    } catch (error) {
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
module.exports = { hash, stateDir, withLock, writeJSON, readRecord, writeOnce, reconcile };
