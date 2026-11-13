'use strict';
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const digest = text => createHash('sha256').update(text).digest('hex');

// This validates a recorded visual judgment, not beauty or reproduction quality.
// Reconciliation must remain possible for older submissions without this record.
function assertEditorialReady(draft, phase) {
  if (phase === 'verify') return;
  if (!draft.editorialReviewEvidence) throw new Error('Full-image editorial review required before a new publication');
  const stat = fs.statSync(draft.editorialReviewEvidence);
  if (!stat.isFile() || stat.size > 262144) throw new Error('Bounded editorial review file required');
  const review = JSON.parse(fs.readFileSync(draft.editorialReviewEvidence, 'utf8'));
  if (review.method !== 'direct_visual_inspection' || !review.reviewer ||
      !Number.isFinite(Date.parse(review.reviewedAt)) || Date.parse(review.reviewedAt) > Date.now() ||
      review.promptBundleSHA256 !== digest(draft.promptParts.join('\n\n')) ||
      !Array.isArray(review.images) || review.images.length !== draft.assets.length) {
    throw new Error('Editorial review is missing or no longer bound to this prompt and image package');
  }
  for (const asset of draft.assets) {
    const matches = review.images.filter(row => row.sha256 === asset.sha256);
    const row = matches[0];
    if (matches.length !== 1 || row.originalInspected !== true || row.promptMatchesImage !== true ||
        row.requiredInputsAvailable !== true || !Array.isArray(row.exclusions) || row.exclusions.length ||
        typeof row.selectionReason !== 'string' || row.selectionReason.trim().length < 12 ||
        (asset.sourceGalleryId && row.sourceGalleryId !== asset.sourceGalleryId)) {
      throw new Error('Image/prompt pairing, prerequisites or visual selection has not passed review');
    }
  }
}
module.exports = { assertEditorialReady };
