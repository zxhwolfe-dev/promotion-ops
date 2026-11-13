'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { writeOnce, reconcile } = require('../lib/state');

test('Juejin unknown submission needs the confirmed original, not its success or draft page', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'juejin-reconcile-'));
  const previous = process.env.PROMO_STATE_DIR;
  process.env.PROMO_STATE_DIR = dir;
  try {
    let id, writes = 0;
    await assert.rejects(writeOnce({ kind: 'juejin.workbuddy_launch', id: 'fixture' }, async ({ operationId, submit }) => {
      id = operationId; await submit(async () => { writes++; }); throw Error('Success page lacks original link');
    }));
    for (const url of ['https://evil.example/post/1', 'https://juejin.cn.evil.example/post/1',
      'https://juejin.cn/published', 'https://juejin.cn/editor/drafts/1']) {
      await assert.rejects(reconcile(id, 'verified', url, true), { code: 'UNTRUSTED_URL' });
    }
    await assert.rejects(reconcile(id, 'verified', 'https://juejin.cn/post/1?token=private', true), { code: 'UNSAFE_EVIDENCE_URL' });
    await assert.rejects(reconcile(id, 'verified', 'https://juejin.cn/post/1'), { code: 'MANUAL_CONFIRMATION_REQUIRED' });
    assert.equal((await reconcile(id, 'verified', 'https://juejin.cn/post/1', true)).state, 'verified');
    assert.equal(writes, 1);
  } finally {
    if (previous === undefined) delete process.env.PROMO_STATE_DIR; else process.env.PROMO_STATE_DIR = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
