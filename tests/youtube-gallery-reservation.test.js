'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {mediaReservation}=require('../scripts/youtube/publish-image-prompt');
test('gallery provenance stays attached when the validated draft stores its identity on the image asset',()=>{
 const asset={id:'aitu-gallery-iwe_sample',sourceGalleryId:'iwe_sample',sha256:'a'.repeat(64),path:'/original.png'};
 const draft={origin:'gallery_example_not_current_generation',evidenceDirectory:'/proof'};
 const row=mediaReservation(asset,draft,'reserved-operation');
 assert.equal(row.sourceGalleryId,'iwe_sample');assert.equal(row.sha256,asset.sha256);assert.equal(row.path,asset.path);assert.equal(row.outcome,'reserved');assert.equal(row.evidence,'/proof/prepared.json');
 assert.equal(asset.sourceGalleryId,'iwe_sample');assert.equal(draft.sourceGalleryId,undefined);
});
test('per-image source identity has priority over a draft-level value; operator originals do not acquire gallery provenance',()=>{
 const draft={sourceGalleryId:'another-gallery',origin:'gallery_example_not_current_generation',evidenceDirectory:'/proof'};
 assert.equal(mediaReservation({sourceGalleryId:'actual-image-gallery'},draft,'op').sourceGalleryId,'actual-image-gallery');
 assert.equal(mediaReservation({}, {origin:'native_aitu_generation',evidenceDirectory:'/proof'},'op').sourceGalleryId,null);
});
