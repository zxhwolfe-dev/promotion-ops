'use strict';
// Platforms resize portrait images by the long edge. The source upload remains
// high resolution; visibility verification concerns the decoded display variant.
function decodedAttachmentMatches(image, asset) {
  if (!image?.complete || !asset || ![image.width, image.height, asset.width, asset.height]
    .every(x => Number.isFinite(x) && x > 0)) return false;
  if (Math.min(image.width, image.height) < 300 || Math.max(image.width, image.height) < 600) return false;
  return Math.abs(image.width / image.height - asset.width / asset.height) <= 0.02;
}
module.exports = { decodedAttachmentMatches };
