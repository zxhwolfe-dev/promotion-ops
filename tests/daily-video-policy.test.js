'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { main } = require('../scripts/ops/daily-execution-plan');
const { videoReleasePlan } = require('../lib/video-release-queue');
const AS_OF = '2026-10-24T10:00:00+08:00';
const slot = overrides => ({id:'ep01:youtube',episode:1,channel:'youtube',publishAt:'2026-10-24T18:00:00+08:00',
  sha256:'a'.repeat(64),status:'scheduled_native_verified',evidence:'/receipt.json',nativeId:'native1',scheduleVerifiedAt:'2026-10-23T12:00:00Z',...overrides});
function fixture(fn) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'promotion-video-policy-'));
  try {
    const queue=path.join(dir,'queue.json'),policy=path.join(dir,'policy.json');
    fs.writeFileSync(queue,JSON.stringify({items:[slot()]}));
    fs.writeFileSync(policy,JSON.stringify({videoReleaseQueue:'queue.json'}));
    fn({dir,queue,policy});
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
test('ordinary daily command automatically follows the active policy without a video-queue flag',()=>fixture(({policy,queue})=>{
  const before=fs.readFileSync(queue,'utf8');
  const {result}=main(['--as-of',AS_OF],{defaultPolicyFile:policy});
  assert.equal(result.videoQueueSource.file,queue);
  assert.equal(result.videoQueueSource.source,'current_policy');
  assert.equal(result.current.find(t=>t.channel==='youtube').nextAction,'wait_native_schedule');
  assert.equal(result.completedTasks,0);
  assert.equal(fs.readFileSync(queue,'utf8'),before);
}));
test('explicit policy works independently of the operator default',()=>fixture(({policy})=>{
  assert.equal(main(['--as-of',AS_OF,'--policy',policy],{defaultPolicyFile:null}).result.videoQueue.items.length,1);
}));
test('explicit queue override does not accidentally read a different broken policy',()=>fixture(({policy,queue})=>{
  fs.writeFileSync(policy,'broken');
  const {result}=main(['--as-of',AS_OF,'--video-queue',queue],{defaultPolicyFile:policy});
  assert.equal(result.videoQueueSource.source,'explicit_queue');
}));
test('broken active policy or missing configured queue fails closed instead of suggesting new uploads',()=>fixture(({policy,queue})=>{
  fs.writeFileSync(policy,JSON.stringify({videoReleaseQueue:null}));
  assert.throws(()=>main(['--as-of',AS_OF],{defaultPolicyFile:policy}),/videoReleaseQueue/);
  fs.writeFileSync(policy,JSON.stringify({videoReleaseQueue:'queue.json'}));fs.unlinkSync(queue);
  assert.throws(()=>main(['--as-of',AS_OF],{defaultPolicyFile:policy}),/ENOENT/);
}));
test('optional absent default retains legacy planning; explicit missing policy is an error',()=>fixture(({dir})=>{
  const absent=path.join(dir,'absent.json');
  assert.equal(main(['--as-of',AS_OF],{defaultPolicyFile:absent}).result.videoQueue,undefined);
  assert.throws(()=>main(['--as-of',AS_OF,'--policy',absent],{defaultPolicyFile:null}),/ENOENT/);
}));
const deferred = () => ({items:[slot({id:'ep05:bilibili',episode:5,channel:'bilibili',status:'uploaded',resumeExistingDraft:true}),
  slot({id:'ep06:bilibili',episode:6,channel:'bilibili',publishAt:'2026-10-25T20:00:00+08:00',sha256:'b'.repeat(64),status:'ready_for_daily_session',qualityGate:'passed'})],
  deferredScheduling:[{channel:'bilibili',notBeforeDay:'2026-10-24',episodes:[5,6],reason:'Observed daily account submission quota'}]});
test('native quota remains blocked before the next Shanghai day, including when the clock is UTC',()=>{
  const p=videoReleasePlan(deferred(),'2026-10-23T15:59:59Z');
  assert.equal(p.schedulingContinuations[0].nextAction,'wait_next_native_day_do_not_submit');
  assert.equal(p.automaticPublish,false);
});
test('next session exposes future booking work but keeps the saved draft separate from a new upload',()=>{
  const p=videoReleasePlan(deferred(),'2026-10-23T16:00:00Z');
  const task=p.schedulingContinuations[0];assert.equal(task.status,'ready_to_resume_native_scheduling');
  assert.equal(task.remainingCount,2);assert.equal(task.remaining[0].action,'reconcile_resume_existing_do_not_upload');
  assert.equal(task.remaining[0].resumeExistingDraft,true);
  assert.equal(task.remaining[1].action,'prepare_future_native_schedule');
  assert.equal(task.nativeQuotaMustBeRechecked,true);
});
test('verified appointments disappear from continuation without counting as public releases',()=>{
  const q=deferred();q.items[0].status='scheduled_native_verified';q.items[1].status='published';
  const p=videoReleasePlan(q,AS_OF);assert.equal(p.schedulingContinuations.length,0);
  assert.equal(p.items[0].action,'wait_native_schedule');
});
test('invalid quota dates fail closed',()=>{
  const q=deferred();q.deferredScheduling[0].notBeforeDay='2026-02-30';
  assert.throws(()=>videoReleasePlan(q,AS_OF),/continuation/);
});
test('canonical single-content cumulative sample closes a due review while retaining explicit zero',()=>fixture(({dir})=>{
  const receipt=path.join(dir,'receipt.json'),snapshot=path.join(dir,'daily.json');
  fs.writeFileSync(path.join(dir,'native.json'),'{}');
  fs.writeFileSync(receipt,JSON.stringify({date:'2026-10-23',publiclyPublished:[{channel:'youtube',
    url:'https://example.test/shorts/1',kind:'short_video',status:'published_native_owner_row_verified',
    publishedAt:'2026-10-23T08:00:00+08:00',verifiedAt:'2026-10-23T08:01:00+08:00',evidence:'native.json'}]}));
  fs.writeFileSync(snapshot,JSON.stringify({rows:[{channel:'youtube',observations:[{
    url:'https://example.test/shorts/1',scope:'single_content',windowType:'cumulative',
    observedAt:'2026-10-24T09:00:00+08:00',metrics:{views:0,likes:null},evidence:'native.json'}]}]}));
  const {result}=main(['--as-of',AS_OF,'--receipt',receipt,'--snapshot',snapshot],{defaultPolicyFile:null});
  const review=result.reviews.find(x=>x.windowHours===24);
  assert.equal(review.status,'reviewed');assert.equal(review.elapsedHours,25);
  assert.deepEqual(review.metrics,{views:0,likes:null});
}));
