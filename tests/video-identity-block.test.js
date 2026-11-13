'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {videoReleasePlan,guardDailyVideoTasks}=require('../lib/video-release-queue');
const item={id:'pilot:youtube',episode:11,channel:'youtube',publishAt:'2026-11-03T18:00:00+08:00',sha256:'a'.repeat(64),status:'blocked_identity_before_upload',humanActionRequired:true,evidence:'/native-identity-dialog.json'};
test('native identity block never becomes an upload before, during or after its publication day',()=>{
 for(const now of ['2026-11-02T16:00:00+08:00','2026-11-03T19:00:00+08:00','2026-11-04T19:00:00+08:00']){
  const releases=videoReleasePlan({items:[item]},now);
  assert.equal(releases.items[0].action,'complete_native_identity_verification_do_not_upload');
  assert.equal(releases.dueUploads.length,0);assert.equal(releases.dueReadbacks.length,0);
  const plan={complete:false,current:[{kind:'workstation_short',channel:'youtube',date:'2026-11-03',status:'due'}]};
  const result=guardDailyVideoTasks(plan,releases);assert.equal(result.current[0].status,'needs_identity_verification');assert.equal(result.complete,false);
 }
 assert.throws(()=>videoReleasePlan({items:[{...item,evidence:null}]},'2026-11-03T19:00:00+08:00'),/Identity block/);
});
test('deferred native scheduling keeps an identity barrier ahead of quota and draft continuation',()=>{
 const q={items:[item],deferredScheduling:[{channel:'youtube',episodes:[11],notBeforeDay:'2026-11-03',reason:'Resume after native checks'}]};
 for(const now of ['2026-11-02T16:00:00+08:00','2026-11-03T19:00:00+08:00']){
  const c=videoReleasePlan(q,now).schedulingContinuations[0];assert.equal(c.status,'needs_identity_verification');assert.equal(c.nextAction,'complete_native_identity_verification_do_not_upload');assert.equal(c.remaining[0].action,c.nextAction);assert.equal(c.automaticPublish,false);
 }
});
