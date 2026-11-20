'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { OpsError } = require('./ops');

// Historical recovery scripts also use this check. Fail closed if a retired
// worker left a claim. The CDP lock serializes current browser operations.
const OWNER_FILE = path.join(os.homedir(), '.local/share/promotion-ops/codex-orchestrator/active.json');
async function assertOpsOwner({ file = OWNER_FILE } = {}) {
  try {
    await fs.lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw new OpsError('OPS_OWNER_UNKNOWN', '运营占用记录不可读，请核对后继续', 4);
  }
  throw new OpsError('OPS_RUNNING', '发现旧运营进程的占用记录，请核对原任务后继续', 4);
}

module.exports = { assertOpsOwner };
