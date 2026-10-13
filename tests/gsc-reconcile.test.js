'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { writeOnce, reconcile } = require('../lib/state');
const { OpsError } = require('../lib/ops');
test('Google receipt reconciliation permits only its HTTPS host and no query data', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsc-reconcile-'));
  process.env.PROMO_STATE_DIR = dir;
  let id;
  try {
    await assert.rejects(writeOnce({ kind: 'gsc.index_request', url: 'https://site.example/intro/' }, async ({ operationId, submit }) => {
      id = operationId; await submit(async () => {}); throw new OpsError('HUMAN_REQUIRED', 'fixture', 3);
    }), { code: 'HUMAN_REQUIRED' });
    await assert.rejects(reconcile(id, 'verified', 'https://example.test/receipt', true), { code: 'UNTRUSTED_URL' });
    await assert.rejects(reconcile(id, 'verified', 'https://search.google.com/search-console/inspect?token=private', true), { code: 'UNSAFE_EVIDENCE_URL' });
    const result = await reconcile(id, 'verified', 'https://search.google.com/search-console/inspect', true);
    assert.equal(result.state, 'verified');
    assert.equal(result.review.previousState, 'needs_human');
    await assert.rejects(reconcile(id, 'not-written', 'https://search.google.com/search-console/inspect', true), { code: 'ALREADY_VERIFIED' });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('TikTok post readback cannot use a foreign or query-bearing evidence URL', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-reconcile-'));
  process.env.PROMO_STATE_DIR = dir;
  let id;
  try {
    await assert.rejects(writeOnce({ kind: 'tiktok.gallery_post', title: 'fixture' }, async ({ operationId, submit }) => {
      id = operationId; await submit(async () => {}); throw new OpsError('UNVERIFIED', 'fixture', 2);
    }), { code: 'UNVERIFIED' });
    await assert.rejects(reconcile(id, 'verified', 'https://example.test/photo/123', true), { code: 'UNTRUSTED_URL' });
    await assert.rejects(reconcile(id, 'verified', 'https://www.tiktok.com/@example/photo/123?image_index=3', true), { code: 'UNSAFE_EVIDENCE_URL' });
    const result = await reconcile(id, 'verified', 'https://www.tiktok.com/@example/photo/123', true);
    assert.equal(result.state, 'verified');
    assert.equal(result.review.previousState, 'unknown');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
