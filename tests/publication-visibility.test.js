'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {publicationVisibility}=require('../lib/publication-visibility');
test('complete owner images alone never establish public visibility',()=>{
  assert.equal(publicationVisibility({mediaVerified:true}).verified,false);
});
test('logged-out pending or restriction overrides a successful author preview',()=>{
  for(const publicState of ['pending_review','restricted']){
    const result=publicationVisibility({mediaVerified:true,nativeState:'published',publicState});
    assert.equal(result.verified,false);
    assert.equal(result.status,publicState==='pending_review'?'pending_review':'restricted_not_public');
  }
});
test('native explicit publication or independent public visibility still requires complete media',()=>{
  for(const input of [{nativeState:'published'},{publicState:'published'}]){
    assert.equal(publicationVisibility({...input,mediaVerified:true}).verified,true);
    assert.equal(publicationVisibility({...input,mediaVerified:false}).verified,false);
  }
});
test('contradictory current pending state cannot be silently turned into a public receipt',()=>{
  assert.equal(publicationVisibility({mediaVerified:true,nativeState:'pending_review',publicState:'published'}).verified,false);
});
test('invalid status labels fail before becoming a public receipt',()=>{
  assert.throws(()=>publicationVisibility({mediaVerified:true,nativeState:'uploaded'}));
});
