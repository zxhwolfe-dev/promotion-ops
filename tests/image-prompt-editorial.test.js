'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { assertEditorialReady } = require('../lib/image-prompt-editorial');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-review-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'review.json');
  const draft = { editorialReviewEvidence: file, promptParts: ['an orange bird'],
    assets: [{ sha256: 'a'.repeat(64), sourceGalleryId: 'example-1' }] };
  const review = { method: 'direct_visual_inspection', reviewer: 'test reviewer',
    reviewedAt: '2026-01-01T00:00:00Z',
    promptBundleSHA256: createHash('sha256').update('an orange bird').digest('hex'),
    images: [{ ...draft.assets[0], originalInspected: true, promptMatchesImage: true,
      requiredInputsAvailable: true, exclusions: [], selectionReason: 'Material and animal silhouette are clearly visible.' }] };
  const save = () => fs.writeFileSync(file, JSON.stringify(review));
  save(); return { draft, review, save };
}
test('a reviewed and bound image/prompt package may be prepared', t => {
  const { draft } = fixture(t); assert.doesNotThrow(() => assertEditorialReady(draft, 'prepare'));
});
test('a generic qualityVerified boolean cannot replace visual review', () => {
  assert.throws(() => assertEditorialReady({ qualityVerified: true }, 'submit'), /review required/);
});
test('thumbnail-only inspection does not authorize publication', t => {
  const f = fixture(t); f.review.images[0].originalInspected = false; f.save();
  assert.throws(() => assertEditorialReady(f.draft, 'submit'), /not passed/);
});
test('changing the image or prompt invalidates its old approval', t => {
  const f = fixture(t); f.draft.assets[0].sha256 = 'b'.repeat(64);
  assert.throws(() => assertEditorialReady(f.draft, 'submit'), /not passed/);
  f.draft.assets[0].sha256 = 'a'.repeat(64); f.draft.promptParts = ['an elephant cloud'];
  assert.throws(() => assertEditorialReady(f.draft, 'submit'), /no longer bound/);
});
test('a known mismatch or unavailable reference input blocks publication', t => {
  const f = fixture(t); f.review.images[0].promptMatchesImage = false; f.save();
  assert.throws(() => assertEditorialReady(f.draft, 'submit'), /not passed/);
  f.review.images[0].promptMatchesImage = true; f.review.images[0].requiredInputsAvailable = false; f.save();
  assert.throws(() => assertEditorialReady(f.draft, 'submit'), /not passed/);
});
test('each attachment needs its own review', t => {
  const f = fixture(t); f.draft.assets.push({ sha256: 'c'.repeat(64) });
  assert.throws(() => assertEditorialReady(f.draft, 'submit'), /no longer bound/);
});
test('old unknown submissions can still be verified without new-publication approval', () => {
  assert.doesNotThrow(() => assertEditorialReady({}, 'verify'));
});
