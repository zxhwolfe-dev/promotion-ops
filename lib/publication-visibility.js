'use strict';
// A complete owner preview does not establish publication. Inputs must come from
// actual native status or an independent public view of the same original.
function publicationVisibility({ mediaVerified, nativeState = 'unknown', publicState = 'unknown' }) {
  const states = new Set(['unknown', 'published', 'pending_review', 'restricted']);
  if (!states.has(nativeState) || !states.has(publicState)) throw new Error('Unknown publication visibility state');
  if ([nativeState, publicState].includes('restricted')) return { verified: false, status: 'restricted_not_public' };
  if ([nativeState, publicState].includes('pending_review')) return { verified: false, status: 'pending_review' };
  if (!mediaVerified) return { verified: false, status: 'requires_result_reconciliation' };
  if ([nativeState, publicState].includes('published')) return { verified: true, status: 'published_native_permalink_verified' };
  return { verified: false, status: 'requires_public_visibility_verification' };
}
module.exports = { publicationVisibility };
