'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {runVideoJob,applyProof}=require('../lib/publishers/video-job');
const {durationMatches}=require('../lib/publishers/native-video-common');
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'video-publisher-'));process.env.PROMO_STATE_DIR=path.join(root,'state');try{
 const bytes=Buffer.from('video-fixture'),sha=crypto.createHash('sha256').update(bytes).digest('hex');await fs.writeFile(root+'/clip.mp4',bytes);await fs.writeFile(root+'/qa.json',JSON.stringify({status:'passed',sha256:sha,seconds:64.4}));await fs.writeFile(root+'/registry.json','[]');
 const job={version:1,channel:'youtube',account:{id:'account',ownerSelector:'#owner',ownerText:'owner',listURL:'https://studio.youtube.com/channel/owned'},episodeId:'ep17',publicationDate:'2026-11-13',videoPath:root+'/clip.mp4',qualityReport:root+'/qa.json',sha256:sha,title:'Six projects',caption:'Tasks and conditions',liveAdapterApproved:true};let uploads=0,clicks=0;
 const proof={state:'published',url:'https://www.youtube.com/shorts/test123',identityVerified:true,contentVerified:true,mediaVerified:true,observedAt:new Date().toISOString()};
 const adapter={page:async()=>({}),assertAccount:async()=>{},prepare:async()=>{uploads++;},preflight:async()=>{},submit:async()=>{clicks++;},readback:async()=>proof,publicOriginal:async()=>({verified:true})};
 const run=(phase,extra={})=>runVideoJob({job,phase,stateRoot:root,registryFile:root+'/registry.json',adapters:{youtube:adapter},browser:fn=>fn({}),...extra});await fn({job,adapter,root,run,counts:()=>({uploads,clicks})});
 }finally{await fs.rm(root,{recursive:true,force:true});}}
test('native submit succeeds only after durable prepare, full proof and public readback; repeat submit never clicks',()=>fixture(async({run,counts})=>{
 assert.equal((await run('prepare')).status,'prepared_native');assert.equal((await run('submit')).status,'published_native_verified');assert.deepEqual(counts(),{uploads:1,clicks:1});await assert.rejects(run('submit'),/no submit retry/);await assert.rejects(run('prepare'),/Existing native/);assert.deepEqual(counts(),{uploads:1,clicks:1});
}));
test('failure after upload preserves reservation and refuses a second upload',()=>fixture(async({adapter,run,counts})=>{adapter.preflight=async()=>{throw Error('editor vanished');};await assert.rejects(run('prepare'),/editor vanished/);await assert.rejects(run('prepare'),/Existing native/);assert.equal(counts().uploads,1);}));
test('interrupted reservation can resume verified original metadata but cannot reupload or bypass identity failure',()=>fixture(async({adapter,run,counts})=>{const prepared=await run('prepare'),rec=JSON.parse(await fs.readFile(prepared.evidence));rec.status='reserved_before_upload';await fs.writeFile(prepared.evidence,JSON.stringify(rec));await assert.rejects(run('prepare'),/Existing native/);adapter.resumePreparation=async()=>{throw Error('Original upload identity differs');};await assert.rejects(run('resume-preparation'),/identity differs/);adapter.resumePreparation=async()=>{};assert.equal((await run('resume-preparation')).status,'prepared_native');assert.deepEqual(counts(),{uploads:1,clicks:0});}));
test('before-submit metadata may resume only through an explicit identity-checking adapter, without another upload',()=>fixture(async({adapter,run,counts})=>{adapter.preflight=async()=>{throw Error('tags not committed');};await assert.rejects(run('prepare'),/tags not committed/);await assert.rejects(run('resume-preparation'),/proven existing uploads/);let resumed=0;adapter.resumePreparation=async()=>{resumed++;};adapter.preflight=async()=>{};assert.equal((await run('resume-preparation')).status,'prepared_native');assert.deepEqual(counts(),{uploads:1,clicks:0});assert.equal(resumed,1);await run('submit');await assert.rejects(run('resume-preparation'),/proven existing uploads/);assert.deepEqual(counts(),{uploads:1,clicks:1});}));
test('ambiguous submit can only read back; it never resubmits',()=>fixture(async({adapter,run,counts})=>{await run('prepare');adapter.readback=async()=>({state:'unknown'});assert.equal((await run('submit')).status,'unknown_reconcile_only');await assert.rejects(run('submit'),/no submit retry/);await run('verify');assert.equal(counts().clicks,1);}));
test('same media cannot evade dedupe by changing date or episode',()=>fixture(async({job,run,root,counts})=>{await run('prepare');await assert.rejects(run('prepare',{job:{...job,episodeId:'ep18',publicationDate:'2026-11-14'}}),/Same media/);assert.equal(counts().uploads,1);}));
test('live submit gate and account proof failures produce no click',()=>fixture(async({job,adapter,run,counts})=>{await run('prepare');await assert.rejects(run('submit',{job:{...job,liveAdapterApproved:false}}),/native preflight/);assert.equal(counts().clicks,0);adapter.assertAccount=async()=>{throw Error('wrong account');};await assert.rejects(run('verify'),/wrong account/);}));
test('a recorded visual rejection remains binding after metadata preparation',()=>fixture(async({run,counts})=>{const prepared=await run('prepare'),record=JSON.parse(await fs.readFile(prepared.evidence));record.visualGate={status:'blocked',reason:'Native cover differs'};await fs.writeFile(prepared.evidence,JSON.stringify(record));await assert.rejects(run('submit'),/visual rejection/);assert.deepEqual(counts(),{uploads:1,clicks:0});}));
test('a toast, review, or lost editor cannot establish public media identity',()=>{
 assert.throws(()=>applyProof({}, {state:'published',url:'https://example.test/1'}),/incomplete/);assert.equal(applyProof({}, {state:'pending_review'}).status,'pending_review');assert.equal(durationMatches('01:04\nTitle',64.4),true);assert.equal(durationMatches('00:01:01\nTitle',60.1),true);assert.equal(durationMatches('Title only',64.4),false);
});
test('TikTok original-upload recovery needs the visible native player total duration',()=>{const {nativeDurationMatches}=require('../lib/publishers/tiktok-video');assert.equal(nativeDurationMatches('播放\n00:00:00 / 00:00:48\n静音',48.47),true);assert.equal(nativeDurationMatches('00:00 / 00:48',48.47),true);assert.equal(nativeDurationMatches('00:00:00 / 00:01:21',48.47),false);assert.equal(nativeDurationMatches('已上传 48MB',48.47),false);});
test('YouTube preserves the failing preparation stage when the native click times out',async()=>{
 const page={locator:()=>({getByRole:()=>({isVisible:async()=>false})}),getByRole:()=>({filter:()=>({first:()=>({waitFor:async()=>{throw Error('Timeout');}})})})};
 await assert.rejects(require('../lib/publishers/youtube-video').prepare(page,{}),/打开创建菜单.*Timeout/);
});
test('YouTube preparation leaves the public community page intact and opens the configured Studio account',async()=>{
 const listURL='https://studio.youtube.com/channel/owner/videos/short';
 let visited;const studio={bringToFront:async()=>{},setDefaultTimeout(){},setDefaultNavigationTimeout(){},goto:async url=>{visited=url;}};
 const context={pages:()=>[{url:()=>'https://www.youtube.com/@owner/posts'}],newPage:async()=>studio};
 assert.equal(await require('../lib/publishers/native-video-common').page(context,{channel:'youtube',account:{listURL}}),studio);
 assert.equal(visited,listURL);
});
test('Douyin cover distribution advice allows an enabled publish action; missing covers still block it',async()=>{
 const adapter=require('../lib/publishers/douyin-video'),job={title:'标题',caption:'文案'};
 let body='内容由AI生成 请勿使用截屏当封面';let enabled=true;
 const button={first:()=>({waitFor:async()=>{}}),count:async()=>1,isEnabled:async()=>enabled};
 const checked={locator:()=>({isChecked:async()=>true})};
 const p={waitForFunction:async()=>{},getByPlaceholder:()=>({inputValue:async()=>job.title}),locator:s=>s==='body'?{innerText:async()=>body}:{first:()=>({innerText:async()=>job.caption})},getByText:()=>({locator:()=>checked}),getByRole:()=>({filter:()=>button})};
 await adapter.preflight(p,job);enabled=false;await assert.rejects(adapter.preflight(p,job),/disabled/);enabled=true;body+=' 横/竖双封面缺失';await assert.rejects(adapter.preflight(p,job),/missing/);
});
