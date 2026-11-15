'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {validateJob}=require('./video-job'),{withLock,writeJSON,readRecord}=require('../state');
function assertPreuploadRecovery(rec,job,rows){
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify([job.channel,job.account.id,job.episodeId,job.publicationDate,job.sha256,job.title,job.caption])).digest('hex');
 if(job.channel!=='youtube'||rec?.status!=='blocked_identity_before_upload'||rec.submittedAt||rec.proof?.url||rec.fingerprint!==fingerprint||rec.nativeIdentityCheck?.noContinueClicked!==true)throw Error('Only a proven identity block before the first file selection can resume here');
 const own=rows.filter(x=>x.operationId===job.operationKey);if(own.length!==1||own[0].sha256!==job.sha256||own[0].channel!=='youtube'||own[0].outcome!=='unknown')throw Error('Original unique reservation missing or already acted on');
}
async function recoverYouTubePreupload({job,stateRoot,registryFile,userVerified,browser,adapter=require('./youtube-video')}){
 if(userVerified!==true)throw Error('Explicit user verification confirmation required');job=await validateJob(job);const file=path.join(stateRoot,'video-jobs',job.operationKey+'.json');
 return withLock('video-job:'+job.operationKey,async()=>{const rec=await readRecord(file),rows=JSON.parse(await fs.readFile(registryFile,'utf8'));assertPreuploadRecovery(rec,job,rows);
  return browser(async c=>{const p=await adapter.page(c,job);await adapter.assertAccount(p,job);
   if(await p.locator('ytcp-uploads-dialog').getByRole('dialog').isVisible().catch(()=>false)||await p.locator('ytcp-video-row').filter({hasText:job.title}).count()||await p.locator('input[type=file]').evaluateAll(es=>es.some(e=>e.files?.length)))throw Error('Existing original upload/post must be reconciled; no file selected');
   if((await p.locator('body').innerText()).includes('验证是你本人在操作'))throw Error('Native identity verification still present');
   rec.identityResolvedAt=new Date().toISOString();rec.humanActionRequired=false;rec.identityRecovery={userConfirmed:true,nativeDialogAbsent:true,matchingPostAbsent:true,selectedFilesAbsent:true,firstUploadOnly:true};rec.status='reserved_before_upload';await writeJSON(file,rec);
   try{await adapter.prepare(p,job);await adapter.preflight(p,job);rec.status='prepared_native';rec.preparedAt=new Date().toISOString();}
   catch(e){rec.status='unknown_upload_reconcile_only';rec.errorCode=e.code||e.name;e.preservePage=true;throw e;}
   finally{await writeJSON(file,rec);await writeJSON(path.join(stateRoot,'video-job-events',job.operationKey,new Date().toISOString().replaceAll(':','-')+'-identity-recovery.json'),rec);await withLock('media-registry:'+registryFile,async()=>{const current=JSON.parse(await fs.readFile(registryFile,'utf8'));const own=current.find(x=>x.operationId===job.operationKey);Object.assign(own,{outcome:rec.status,evidence:file,updatedAt:new Date().toISOString()});await writeJSON(registryFile,current);});if(job.queueFile)await require('../release-registration').recordJobResult(job.queueFile,job,{status:rec.status,evidence:file},new Date().toISOString());}
   return{status:rec.status,operationId:job.operationKey,evidence:file,additionalReservation:false,submitted:false};
  });
 });
}
module.exports={assertPreuploadRecovery,recoverYouTubePreupload};
