'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { executionPlan } = require('../lib/daily-execution');
const at = '2026-10-23T23:00:00+08:00';
const imagePost = { channel:'x',kind:'radar_daily_three_images',featureIds:['ai-open-source-radar'],
  assets:[{id:'one'},{id:'two'},{id:'three'}],url:'https://x.com/useaistation/status/2113639410789191842',
  status:'published_native_permalink_verified',publishedAt:'2026-10-23T22:31:19+08:00',
  verifiedAt:'2026-10-23T22:32:17+08:00',evidence:'/native-permalink.json',evidenceFilePresent:true };
const plan = (receipt, asOf = at) => executionPlan({asOf,receipts:[{date:'2026-10-23',...receipt}]});
test('X becomes a daily image task without turning historical days into missed obligations',()=>{
  assert.equal(plan({},'2026-10-22T23:00:00+08:00').requiredTasks,6);
  assert.equal(plan({}).requiredTasks,7);
  assert.equal(plan({publiclyPublished:[imagePost]}).current.find(t=>t.channel==='x').status,'complete');
  assert.equal(plan({publiclyPublished:[imagePost]},'2026-10-24T23:00:00+08:00').current.find(t=>t.channel==='x').status,'due');
});
test('unknown X submission in pending prevents a second publish suggestion',()=>{
  const p=plan({pending:[{...imagePost,publishedAt:null,verifiedAt:null,status:'unknown_after_submit'}]});
  assert.equal(p.current.find(t=>t.channel==='x').nextAction,'verify_existing_result_do_not_resubmit');
});
test('an AK package or X video cannot satisfy Radar images; missing images/evidence cannot complete',()=>{
  for(const extra of [{kind:'three_native_images',featureIds:['ak-battle']},{kind:'short_video'},
    {assets:[]},{evidenceFilePresent:false},{status:'scheduled_native_verified'}]){
    assert.notEqual(plan({publiclyPublished:[{...imagePost,...extra}]}).current.find(t=>t.channel==='x').status,'complete');
  }
});
