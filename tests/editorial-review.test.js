'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {identity,reviewContent,assertApproved}=require('../lib/editorial-review');
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'editorial-'));try{const c={creativeRoot:root,reviewRoot:path.join(root,'reviews'),publisherStateRoot:path.join(root,'publisher'),model:'gpt-6.1-sol',effort:'medium'},job={channel:'douyin',account:{id:'owner'},publicationDate:'2026-11-17',title:'Task',caption:'Source based',videoPath:path.join(root,'video.mp4')},jobFile=path.join(root,'job.json'),image=path.join(root,'frame.png');await fs.writeFile(job.videoPath,'original media');await fs.writeFile(jobFile,JSON.stringify(job));await fs.writeFile(image,'fixture-image');const manifest={contentId:'ep21',date:job.publicationDate,brief:{audience:'developers',viewerTask:'review code',opening:'Find a concrete bug',whyThisContent:'verified source task'},jobFiles:[jobFile],files:[],previewImages:[image]};const execute=async(config,o)=>{const request=JSON.parse(await fs.readFile(path.join(o.directory,'input.json')));assert.deepEqual(o.imagePaths,request.manifest.previewImages);const input=JSON.parse(await fs.readFile(path.join(o.directory,'started.json')));return{turnCompleted:true,threadId:'independent-thread',final:{contentId:input.contentId,manifestHash:input.manifestHash,decision:'approve',audienceValue:'Specific task',openingReview:'Concrete opening',factualReview:'Sources checked',visualReview:'Frames readable',issues:[],suggestions:[]}};};await fn({root,c,job,jobFile,image,manifest,execute});}finally{await fs.rm(root,{recursive:true,force:true});}}
test('nested account and copy changes alter the reviewed job identity',()=>{const j={account:{id:'one'},title:'A'};assert.notEqual(identity(j),identity({...j,account:{id:'two'}}));assert.equal(identity(j),identity({...j,operationKey:'generated',expectedDurationSeconds:40}));});
test('cover bytes are automatically bound to independent approval',()=>fixture(async f=>{f.job.coverPath=path.join(f.root,'cover.png');await fs.writeFile(f.job.coverPath,'original cover');await fs.writeFile(f.jobFile,JSON.stringify(f.job));await reviewContent({...f,execute:f.execute});await fs.writeFile(f.job.coverPath,'changed cover');await assert.rejects(assertApproved(f.job,f.c.publisherStateRoot),/changed/);}));
test('approved exact content opens the gate; changed media or copy does not',()=>fixture(async f=>{await assert.rejects(assertApproved(f.job,f.c.publisherStateRoot),/approval missing/);const r=await reviewContent({...f,execute:f.execute});assert.equal(r.decision,'approve');await assertApproved(f.job,f.c.publisherStateRoot);await assert.rejects(assertApproved({...f.job,caption:'changed'},f.c.publisherStateRoot),/approval missing/);await fs.writeFile(f.job.videoPath,'changed media');await assert.rejects(assertApproved(f.job,f.c.publisherStateRoot),/changed/);}));
test('revise never creates a publishing approval; reviewer must finish a genuine turn',()=>fixture(async f=>{const r=await reviewContent({...f,execute:async(c,o)=>{const x=await f.execute(c,o);x.final.decision='revise';x.final.issues=['Opening is vague'];return x;}});assert.equal(r.decision,'revise');await assert.rejects(assertApproved(f.job,f.c.publisherStateRoot),/approval missing/);f.manifest.contentId='other';await assert.rejects(reviewContent({...f,execute:async(c,o)=>({...await f.execute(c,o),turnCompleted:false})}),/invalid/);}));
test('content changing during review cannot be approved, and sources outside creative scope are rejected',()=>fixture(async f=>{await assert.rejects(reviewContent({...f,execute:async(c,o)=>{const r=await f.execute(c,o);await fs.writeFile(f.image,'mutated');return r;}}),/changed/);f.manifest.contentId='outside';f.manifest.files=['/etc/passwd'];await assert.rejects(reviewContent({...f,execute:f.execute}),/scope/);}));
test('readonly reviewer cannot connect to the signed-in browser',async()=>{const before=process.env.PROMO_REVIEW_ONLY;process.env.PROMO_REVIEW_ONLY='1';try{await assert.rejects(require('../lib/cdp').withBrowser(()=>{throw Error('must not connect');}),{code:'READONLY_REVIEW'});}finally{if(before===undefined)delete process.env.PROMO_REVIEW_ONLY;else process.env.PROMO_REVIEW_ONLY=before;}});
test('readonly reviewer cannot start another review',async()=>{
 const before=process.env.PROMO_REVIEW_ONLY;process.env.PROMO_REVIEW_ONLY='1';
 try{await assert.rejects(reviewContent({}),/cannot start another reviewer/);}
 finally{if(before===undefined)delete process.env.PROMO_REVIEW_ONLY;else process.env.PROMO_REVIEW_ONLY=before;}
});


test('revision receives the first verdict; optional polish does not prevent valid approval',()=>fixture(async f=>{
 await reviewContent({...f,execute:async(c,o)=>{const r=await f.execute(c,o);r.final.decision='revise';r.final.issues=['First screen gives no task'];return r;}});
 const changed={...f.job,title:'Find a concrete bug'};await fs.writeFile(f.jobFile,JSON.stringify(changed));
 const result=await reviewContent({...f,execute:async(c,o)=>{
  const input=JSON.parse(await fs.readFile(path.join(o.directory,'input.json')));
  assert.equal(input.format,'radar_video');assert.deepEqual(input.previousReview.issues,['First screen gives no task']);
  const r=await f.execute(c,o);r.final.suggestions=['Try a different minor subtitle color next time'];return r;
 }});
 assert.equal(result.decision,'approve');assert.equal(result.suggestions.length,1);
 await assertApproved(changed,f.c.publisherStateRoot);
 await assert.rejects(reviewContent({...f,execute:f.execute}),/Two reviews/);
}));

test('a revise verdict without concrete blocking issues is rejected',()=>fixture(async f=>{
 await assert.rejects(reviewContent({...f,execute:async(c,o)=>{const r=await f.execute(c,o);r.final.decision='revise';r.final.suggestions=['Minor polish'];return r;}}),/invalid/);
}));

test('one user-directed manual repair preserves both refused attempts',()=>fixture(async f=>{
 const revise=async(c,o)=>{const r=await f.execute(c,o);r.final.decision='revise';r.final.issues=['Fix source contradiction'];return r;};
 await reviewContent({...f,execute:revise});await fs.writeFile(f.image,'revised one');await reviewContent({...f,execute:revise});
 await fs.writeFile(f.image,'repaired after direct user request');
 const instruction='User: complete the repairs now';
 const result=await reviewContent({...f,manualRepairAuthorization:instruction,execute:f.execute});assert.equal(result.decision,'approve');
 const attemptsDir=path.join(f.c.reviewRoot,'attempts');const files=await fs.readdir(attemptsDir);const attempts=JSON.parse(await fs.readFile(path.join(attemptsDir,files[0])));assert.equal(attempts.length,3);assert.equal(attempts[2].manualRepairAuthorization,instruction);
 await assert.rejects(reviewContent({...f,manualRepairAuthorization:instruction,execute:f.execute}),/Two reviews/);
}));
test('one approved cover-only follow-up retains the same content ID and has a hard final limit',()=>fixture(async f=>{
 const refuse=async(c,o)=>{const r=await f.execute(c,o);r.final.decision='revise';r.final.issues=['Fix opening'];return r;};
 await reviewContent({...f,execute:refuse});await fs.writeFile(f.image,'second');await reviewContent({...f,execute:refuse});await fs.writeFile(f.image,'third');await reviewContent({...f,execute:f.execute,manualRepairAuthorization:'user repair'});
 const cover=path.join(f.root,'new-cover.png'),newFile=path.join(f.root,'cover-job.json');await fs.writeFile(cover,'new approved cover');await fs.writeFile(newFile,JSON.stringify({...f.job,coverPath:cover}));f.manifest={...f.manifest,jobFiles:[newFile],previewImages:[cover]};
 const r=await reviewContent({...f,execute:f.execute,manualRepairAuthorization:'user cover repair after platform warning'});assert.equal(r.decision,'approve');await assert.rejects(reviewContent({...f,execute:f.execute,manualRepairAuthorization:'another'}),/Two reviews/);
}));
