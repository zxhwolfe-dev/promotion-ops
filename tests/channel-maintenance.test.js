'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { maintenanceAudit } = require('../lib/channel-maintenance');
const asOf = '2026-11-11T08:30:00Z';
const channel = overrides => ({id:'reddit',platform:'reddit',mode:'active',operationalRole:'selective_community_support',lastCheckedAt:'2026-10-21T08:00:00Z',lastCheckStatus:'not_checked',...overrides});
const observation = overrides => ({channel:'reddit',observedAt:asOf,evidenceFilePresent:true,publicationStatus:'published',metrics:{views:null},...overrides});
const audit = (channels, observations = []) => maintenanceAudit({channels,observations,asOf});
test('old and blocked active channels remain visible as review work without publishing', () => {
  const p = audit([channel(),channel({id:'producthunt',blockedReason:'security_verification_required'})]);
  assert.deepEqual(p.overdueActive,['reddit','producthunt']);
  assert.ok(p.rows.every(r=>r.automaticPublish===false && r.automaticOperation===false));
});
test('evidenced readable content advances subset review, not unknown numeric counters', () => {
  const r = audit([channel()],[observation()]).rows[0];
  assert.equal(r.reviewDue,false);assert.equal(r.lastNumericObservationAt,null);
  assert.equal(r.coverage,'evidenced_content_subset');
});
test('failed or missing-evidence access cannot clear stale review or prompt immediate retries', () => {
  for (const patch of [{publicationStatus:'unavailable'},{evidenceFilePresent:false}]) {
    const r = audit([channel()],[observation(patch)]).rows[0];
    assert.equal(r.reviewDue,true);assert.equal(r.lastContentReviewAt,null);
    if(patch.publicationStatus)assert.equal(r.nextAction,'access_failed_defer_do_not_retry');
  }
});
test('manual platforms and paused accounts remain excluded even when review is overdue', () => {
  const p = audit([channel({id:'douyin',platform:'douyin'}),channel({id:'zhihu',mode:'paused'})]);
  assert.ok(p.rows.every(r=>r.nextAction==='keep_manual_or_paused'));
  assert.deepEqual(p.overdueActive,[]);
});
test('daily planner automatically exposes configured channel audit and leaves registry unchanged', () => {
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {main}=require('../scripts/ops/daily-execution-plan');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'promotion-maintenance-'));
  try {
    const registry=path.join(dir,'channels.json'),policy=path.join(dir,'policy.json');
    const before=JSON.stringify({channels:[channel()]});fs.writeFileSync(registry,before);
    fs.writeFileSync(path.join(dir,'queue.json'),JSON.stringify({items:[]}));
    fs.writeFileSync(policy,JSON.stringify({videoReleaseQueue:'queue.json',channelRegistry:'channels.json'}));
    const {result}=main(['--as-of',asOf],{defaultPolicyFile:policy});
    assert.deepEqual(result.channelMaintenance.overdueActive,['reddit']);
    assert.equal(fs.readFileSync(registry,'utf8'),before);
    fs.writeFileSync(policy,JSON.stringify({channelRegistry:'channels.json'}));
    assert.deepEqual(main(['--as-of',asOf],{defaultPolicyFile:policy}).result.channelMaintenance.overdueActive,['reddit']);
    fs.unlinkSync(registry);assert.throws(()=>main(['--as-of',asOf],{defaultPolicyFile:policy}),/ENOENT/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('unknown content blockers remain scoped and numeric zero stays a legitimate counter', () => {
  const unresolved=[{intentId:'old-image',status:'unknown',automaticResend:false}];
  const r = audit([channel({unresolvedPublications:unresolved})],[observation({metrics:{views:0}})]).rows[0];
  assert.deepEqual(r.unresolvedPublications,unresolved);assert.equal(r.lastNumericObservationAt,asOf.replace('Z','.000Z'));
  assert.equal(r.blocker,null);
});
