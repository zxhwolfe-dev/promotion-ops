'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { writeOnce, reconcile } = require('../lib/state');

test('V2EX reconciliation accepts the confirmed original, rejecting review pages and wrong hosts', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'v2ex-reconcile-'));
  const previous = process.env.PROMO_STATE_DIR;
  process.env.PROMO_STATE_DIR = dir;
  try {
    let id, writes = 0;
    await assert.rejects(writeOnce({ kind: 'v2ex.workbuddy_launch', id: 'fixture' }, async ({ operationId, submit }) => {
      id = operationId;
      await submit(async () => { writes++; });
      throw Error('Creation receipt read instead of original');
    }));
    for (const url of ['https://evil.example/t/1', 'https://www.v2ex.com.evil.example/t/1',
      'https://www.v2ex.com/t/1/review', 'https://www.v2ex.com/new/create']) {
      await assert.rejects(reconcile(id, 'verified', url, true), { code: 'UNTRUSTED_URL' });
    }
    await assert.rejects(reconcile(id, 'verified', 'https://www.v2ex.com/t/1?token=private', true), { code: 'UNSAFE_EVIDENCE_URL' });
    await assert.rejects(reconcile(id, 'verified', 'https://www.v2ex.com/t/1'), { code: 'MANUAL_CONFIRMATION_REQUIRED' });
    assert.equal((await reconcile(id, 'verified', 'https://www.v2ex.com/t/1', true)).state, 'verified');
    assert.equal(writes, 1);
  } finally {
    if (previous === undefined) delete process.env.PROMO_STATE_DIR; else process.env.PROMO_STATE_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
