'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { writeOnce, reconcile } = require('../lib/state');
test('a Bilibili unknown submission can be reconciled only with a confirmed trusted original', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-reconcile-'));
  const previous = process.env.PROMO_STATE_DIR;
  process.env.PROMO_STATE_DIR = dir;
  try {
    let id, writes = 0;
    await assert.rejects(writeOnce({ kind: 'bilibili.image_prompt', id: 'fixture' }, async ({ operationId, submit }) => {
      id = operationId; await submit(async () => { writes++; }); throw new Error('readback timed out');
    }));
    await assert.rejects(reconcile(id, 'verified', 'https://evil.example/post/1', true), { code: 'UNTRUSTED_URL' });
    await assert.rejects(reconcile(id, 'verified', 'https://t.bilibili.com/1?token=private', true), { code: 'UNSAFE_EVIDENCE_URL' });
    await assert.rejects(reconcile(id, 'verified', 'https://t.bilibili.com/1'), { code: 'MANUAL_CONFIRMATION_REQUIRED' });
    assert.equal((await reconcile(id, 'verified', 'https://t.bilibili.com/1', true)).state, 'verified');
    assert.equal(writes, 1);
  } finally {
    if (previous === undefined) delete process.env.PROMO_STATE_DIR; else process.env.PROMO_STATE_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
