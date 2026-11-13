'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {withLock,writeJSON,readRecord}=require('../state');
const {OpsError}=require('../ops');
const {timestamp}=require('../daily-execution');
const SUPPORTED=new Set(['douyin','bilibili','tiktok','youtube','x']);
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
async function validateJob(job) {
 if(!job || job.version!==1 || !SUPPORTED.has(job.channel) || !job.account?.id || !job.episodeId || !/^\d{4}-\d{2}-\d{2}$/.test(job.publicationDate || '') || !job.videoPath || !job.qualityReport || !job.caption || !job.title)throw Error('Invalid video job');
 if(timestamp(job.publicationDate+'T00:00:00+08:00')===null)throw Error('Invalid publication day');
 const allowed={douyin:'creator.douyin.com',bilibili:'member.bilibili.com',youtube:'studio.youtube.com',tiktok:'www.tiktok.com',x:'x.com'};
 const url=new URL(job.account.listURL);if(url.protocol!=='https:'||url.hostname!==allowed[job.channel]||url.username||url.password)throw Error('Invalid native account list URL');
 if(!job.account.ownerSelector || !job.account.ownerText || !job.account.listURL)throw Error('Native account proof configuration required');
 if(job.channel==='x' && job.caption.replace(/https:\/\/\S+/g,'x'.repeat(23)).length>280)throw Error('X caption exceeds ordinary account length');
 if(['tiktok','youtube','x'].includes(job.channel) && /[\u4e00-\u9fff]/.test(job.caption+job.title+path.basename(job.videoPath)))throw Error('English platform requires English copy and file name');
 const qa=JSON.parse(await fs.readFile(job.qualityReport,'utf8')),sha=digest(await fs.readFile(job.videoPath));
 if(qa.status!=='passed'||qa.sha256!==sha||job.sha256!==sha)throw Error('Missing or stale video QA');
 return {...job,expectedDurationSeconds:qa.seconds,operationKey:digest(JSON.stringify([job.channel,job.account.id,job.episodeId,sha]))};
}
async function reserveMedia(job,registryFile,jobFile) {
 return withLock('media-registry:'+registryFile,async()=>{
  const rows=JSON.parse(await fs.readFile(registryFile,'utf8'));
  if(rows.some(x=>x.channel===job.channel && x.sha256===job.sha256 && !['not_published','rejected'].includes(x.outcome)))throw new OpsError('RECONCILE_REQUIRED','Same media already reserved or used; reconcile it, never reupload',2);
  if(rows.some(x=>x.channel===job.channel && x.episodeId===job.episodeId && x.contentFamily==='radar_daily_video' && !['not_published','rejected'].includes(x.outcome)))throw new OpsError('RECONCILE_REQUIRED','Episode already has a platform intent',2);
  const row={operationId:job.operationKey,channel:job.channel,accountId:job.account.id,episodeId:job.episodeId,sha256:job.sha256,contentFamily:'radar_daily_video',publicationDate:job.publicationDate,outcome:'unknown',reservedAt:new Date().toISOString(),evidence:jobFile};
  rows.push(row);await writeJSON(registryFile,rows);return row;
 });
}
async function updateMedia(key,registryFile,patch) {
 return withLock('media-registry:'+registryFile,async()=>{const rows=JSON.parse(await fs.readFile(registryFile,'utf8'));const row=rows.find(x=>x.operationId===key);if(!row)throw Error('Reservation disappeared');Object.assign(row,patch);await writeJSON(registryFile,rows);});
}
async function runVideoJob({job,phase,stateRoot,registryFile,adapters,browser}) {
 job=await validateJob(job);if(!['prepare','resume-preparation','submit','verify'].includes(phase))throw Error('prepare/resume-preparation/submit/verify required');
 const adapter=adapters[job.channel];if(!adapter)throw Error('Unsupported platform adapter');
 const file=path.join(stateRoot,'video-jobs',job.operationKey+'.json');
 return withLock('video-job:'+job.operationKey,async()=>{
  const persist=async record=>{const event=path.join(stateRoot,'video-job-events',job.operationKey,new Date().toISOString().replaceAll(':','-')+'-'+crypto.randomBytes(4).toString('hex')+'.json');await writeJSON(event,record);await writeJSON(file,record);if(job.queueFile)await require('../release-registration').recordJobResult(job.queueFile,job,{status:record.status,evidence:file,proof:record.proof||null},new Date().toISOString());};
  let rec=await readRecord(file);
  const fingerprint=digest(JSON.stringify([job.channel,job.account.id,job.episodeId,job.publicationDate,job.sha256,job.title,job.caption]));
  if(rec && rec.fingerprint!==fingerprint)throw Error('Prepared job content differs; reconcile original without editing it');
  if(phase==='prepare' && rec)throw new OpsError('RECONCILE_REQUIRED','Existing native upload must be reconciled; prepare is not retried',2);
  if(phase!=='prepare' && !rec)throw Error('No prepared job');
  return browser(async context=>{
   const p=await adapter.page(context,job);await adapter.assertAccount(p,job);
   if(phase==='prepare') {
    await reserveMedia(job,registryFile,file);
    rec={fingerprint,operationId:job.operationKey,channel:job.channel,episodeId:job.episodeId,status:'reserved_before_upload',at:new Date().toISOString(),job};await persist(rec);
    try{await adapter.prepare(p,job);await adapter.preflight(p,job);rec.status='prepared_native';rec.preparedAt=new Date().toISOString();await persist(rec);}
    catch(e){rec.status='unknown_upload_reconcile_only';rec.errorCode=e.code||'PREPARE_FAILED';await persist(rec);e.preservePage=true;throw e;}
   } else if(phase==='resume-preparation') {
    if(rec.status!=='unknown_upload_reconcile_only'||rec.submittedAt||!adapter.resumePreparation)throw new OpsError('RECONCILE_REQUIRED','Only proven existing uploads before any submit may resume metadata preparation',2);
    await adapter.resumePreparation(p,job);await adapter.preflight(p,job);rec.status='prepared_native';rec.preparedAt=new Date().toISOString();await persist(rec);
   } else if(phase==='submit') {
    if(rec.status!=='prepared_native')throw new OpsError('RECONCILE_REQUIRED','Not in a known prepared state; no submit retry',2);
    if(rec.visualGate?.status==='blocked')throw new OpsError('VISUAL_REVIEW_REQUIRED','Existing visual rejection must be resolved on the original upload before submitting',3);
    if(job.liveAdapterApproved!==true)throw new OpsError('LIVE_VALIDATION_REQUIRED','This adapter must pass native preflight before first live submit',3);
    await adapter.preflight(p,job);rec.status='submitted_reconcile_only';rec.submittedAt=new Date().toISOString();await persist(rec);
    try{const submissionReceipt=await adapter.submit(p,job);if(submissionReceipt){rec.submissionReceipt=submissionReceipt;await persist(rec);}}catch(e){e.preservePage=true;throw e;}
    const proof=await adapter.readback(p,job);if(proof.state==='published')proof.publicProbe=await (adapter.publicOriginal || require('./public-original').publicOriginal)(job,proof);rec=applyProof(rec,proof);await persist(rec);
   } else {
    const proof=await adapter.readback(p,job);if(proof.state==='published')proof.publicProbe=await (adapter.publicOriginal || require('./public-original').publicOriginal)(job,proof);rec=applyProof(rec,proof);await persist(rec);
   }
   await updateMedia(job.operationKey,registryFile,{outcome:rec.status,nativeURL:rec.proof?.url||null,evidence:file,updatedAt:new Date().toISOString()});
   return {status:rec.status,channel:job.channel,operationId:job.operationKey,evidence:file,proof:rec.proof||null,automaticRetry:false};
  });
 });
}
function applyProof(rec,proof) {
 if(!proof || !['published','pending_review','restricted','unknown'].includes(proof.state))throw Error('Invalid native proof');
 if(proof.state==='published' && (!proof.url || proof.identityVerified!==true || proof.contentVerified!==true || proof.mediaVerified!==true || !proof.observedAt))throw Error('Publication proof incomplete');
 return {...rec,status:proof.state==='published'?(proof.publicProbe?.verified===true?'published_native_verified':'published_native_verified_external_unknown'):proof.state==='pending_review'?'pending_review':proof.state==='restricted'?'restricted_not_public':'unknown_reconcile_only',proof};
}
module.exports={validateJob,reserveMedia,runVideoJob,applyProof};
