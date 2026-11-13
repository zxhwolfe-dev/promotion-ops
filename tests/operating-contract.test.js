'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {executionPlan}=require('../lib/daily-execution');
const {videoReleasePlan}=require('../lib/video-release-queue');
const {maintenanceAudit}=require('../lib/channel-maintenance');
const now='2026-11-13T22:00:00+08:00';
test('an installed creation timer is reported without claiming automatic publishing',()=>{const p=executionPlan({asOf:now,receipts:[],automation:{buildTimerInstalled:true}});assert.equal(p.schedulerInstalled,true);assert.equal(p.schedulerScope,'local_creation_only');assert.equal(p.automaticPublish,false);});
test('project-count contract requires explicit bounded integers',()=>{const {DEFAULT_CONTRACT,validateContract}=require('../lib/operating-contract');for(const projects of [undefined,{min:8,max:6},{min:6.5,max:8}])assert.throws(()=>validateContract({...DEFAULT_CONTRACT,projects}),/project contract/);});
const item=(extra={})=>({id:'ep16:youtube',episode:16,channel:'youtube',publicationDate:'2026-11-13',publishAt:null,sha256:'a'.repeat(64),qualityGate:'passed',status:'ready_for_authorized_session',...extra});
test('active eight tasks include four video platforms, X alternative and three AK; suspended Snowball is not missing',()=>{
 const p=executionPlan({asOf:now,receipts:[]});assert.equal(p.requiredTasks,8);assert.deepEqual(p.current.filter(x=>x.kind==='workstation_short').map(x=>x.channel),['douyin','bilibili','tiktok','youtube']);assert.equal(p.current.some(x=>x.channel==='xueqiu'),false);assert.equal(p.pausedChannels[0].channel,'xueqiu');
});
test('instant uploads use explicit publication day, never source day; multiple episodes per day are valid',()=>{
 const q=videoReleasePlan({items:[item(),item({id:'ep17:youtube',episode:17,sha256:'b'.repeat(64)})]},now);assert.equal(q.dueUploads.length,2);assert.equal(q.counts.total,2);
 assert.throws(()=>videoReleasePlan({items:[item({publicationDate:null,sourceDate:'2026-11-13'})]},now),/Invalid/);
 for(const channel of ['douyin','x'])assert.equal(videoReleasePlan({items:[item({channel})]},now).dueUploads.length,1);
});
test('native public with external visibility unknown and X lost editor can only reconcile',()=>{
 for(const status of ['published_native_verified_external_unknown','unknown_pre_submit_editor_closed_reconcile_only','pending_review']){
 const q=videoReleasePlan({items:[item({status})]},now);assert.equal(q.dueUploads.length,0);assert.equal(q.dueReadbacks.length,1);
 }
 assert.throws(()=>videoReleasePlan({items:[item({status:'typo_published'})]},now),/Unknown/);
});
test('known-day publication can complete a video task without invented exact time; state string alone cannot',()=>{
 const row={channel:'youtube',kind:'radar_daily_video',status:'published_native_verified',verified:true,url:'https://youtube.com/shorts/a',publishedAt:null,publicationDate:'2026-11-13',verifiedAt:now,evidence:'/proof.json',evidenceFilePresent:true};
 const run=r=>executionPlan({asOf:now,receipts:[{date:'2026-11-13',publiclyPublished:[r]}]}).current.find(x=>x.channel==='youtube');
 assert.equal(run(row).status,'complete');assert.notEqual(run({...row,verified:false}).status,'complete');assert.notEqual(run({...row,publicVerified:false}).status,'complete');assert.notEqual(run({...row,publicationDate:null,sourceDate:'2026-11-13'}).status,'complete');
});
test('one valid X format satisfies daily quota; other uncertain video remains listed without another submission',()=>{
 const row={channel:'x',kind:'radar_daily_video',status:'published_native_verified',verified:true,url:'https://x.com/a/status/1',publishedAt:now,verifiedAt:now,sha256:'a'.repeat(64),featureIds:['ai-open-source-radar'],evidence:'/proof.json',evidenceFilePresent:true};
 const p=executionPlan({asOf:now,receipts:[{date:'2026-11-13',publiclyPublished:[row],pending:[{...row,verified:false,status:'unknown'}]}]});assert.equal(p.current.find(x=>x.channel==='x').status,'complete');assert.equal(p.unresolvedPublications.length,1);
 assert.notEqual(executionPlan({asOf:now,receipts:[{date:'2026-11-13',publiclyPublished:[{...row,sha256:null}]}]}).current.find(x=>x.channel==='x').status,'complete');
});
test('Douyin inclusion is scoped to explicitly enabled Radar; WeChat remains manual',()=>{
 const ch={id:'douyin',platform:'douyin',mode:'active',operationalRole:'daily_native_video',enabledProgrammes:['radar_daily']};
 const a=maintenanceAudit({channels:[ch,{...ch,id:'wechat-channels',platform:'wechat-channels'}],asOf:now});assert.notEqual(a.rows[0].nextAction,'keep_manual_or_paused');assert.equal(a.rows[1].nextAction,'keep_manual_or_paused');
});

test('planner reports the configured three-publisher timer separately from its own read-only execution',()=>{const p=executionPlan({asOf:now,receipts:[],automation:{buildTimerInstalled:true,publisherTimerInstalled:true,unattendedPublishingEnabled:true,validatedPublishChannels:['douyin','bilibili','tiktok']}});assert.equal(p.schedulerScope,'local_radar_creation_and_validated_publishers');assert.equal(p.scheduledPublishingEnabled,true);assert.deepEqual(p.scheduledPublishChannels,['douyin','bilibili','tiktok']);assert.equal(p.automaticPublish,false);assert.equal(p.planPerformsPublication,false);const disabled=executionPlan({asOf:now,receipts:[],automation:{buildTimerInstalled:true,publisherTimerInstalled:true,unattendedPublishingEnabled:false,validatedPublishChannels:['douyin']}});assert.equal(disabled.scheduledPublishingEnabled,false);});
