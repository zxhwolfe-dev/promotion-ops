'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {withLock,writeJSON,readRecord}=require('../state');
const {checkAKPackage}=require('../ak-package-check');
const {reserveAKPackage}=require('../ak-package-reservation');
const {assertNoChallenge,OpsError}=require('../ops');
const native=require('./ak-native');
const HOSTS={weibo:['weibo.com'],toutiao:['mp.toutiao.com','www.toutiao.com'],taoguba:['www.tgb.cn','tgb.cn']};
function assertURL(raw,ch){const u=new URL(raw);if(u.protocol!=='https:'||!HOSTS[ch]?.includes(u.hostname)||u.username||u.password)throw Error('Untrusted AK platform URL');return u;}
async function assertAKAccount(p,job){
 const matches=async page=>{const owner=page.locator(job.account.ownerSelector).filter({visible:true});if(await owner.count()!==1)return false;if(job.account.ownerAttribute){if(!['href','data-uid','data-user-id'].includes(job.account.ownerAttribute)||!job.account.ownerValue)throw Error('Invalid native owner attribute proof');return await owner.getAttribute(job.account.ownerAttribute)===job.account.ownerValue;}return (await owner.innerText()).includes(job.account.ownerText);};
 await assertNoChallenge(p);if(await matches(p))return;
 if(job.account.proofURL){assertURL(job.account.proofURL,job.channel);const probe=await p.context().newPage();let keep=false;try{await probe.goto(job.account.proofURL,{waitUntil:'domcontentloaded',timeout:45000});await assertNoChallenge(probe);await probe.locator(job.account.ownerSelector).filter({hasText:job.account.ownerText}).first().waitFor({timeout:20000});if(await matches(probe))return;}catch(e){keep=true;e.preservePage=true;await probe.bringToFront();throw e;}finally{if(!keep){await probe.close();await p.bringToFront();}}}
 throw new OpsError('ACCOUNT_UNVERIFIED','Account login/identity needs verification',3);
}
async function runAKJob({job,phase,registryFile,stateRoot,browser,adapter=native,asOf=new Date().toISOString()}) {
 if(!HOSTS[job.channel]||job.blockedChannels?.includes(job.channel))throw Error('AK channel paused/not enabled');
 if(!['inspect','prepare','submit','verify'].includes(phase))throw Error('Unknown AK phase');
 if(!job.account?.ownerSelector||!job.account.ownerText)throw Error('Account proof configuration required');
 assertURL(job.account.composeURL,job.channel);assertURL(job.account.listURL,job.channel);
 const caption=job.channelCaptions?.[job.channel]||job.caption;job={...job,caption,asOf};
 const registry=JSON.parse(await fs.readFile(registryFile,'utf8'));const key=crypto.createHash('sha256').update(JSON.stringify([job.channel,job.publicationDate,job.reports.map(x=>x.sha256)])).digest('hex');const file=path.join(stateRoot,'ak-jobs',key+'.json');
 const existing=await readRecord(file),own=existing?.reservation?.operationId;
 const checked=checkAKPackage({...job,previousUses:registry.filter(x=>phase==='submit'&&own?x.operationId!==own:true)});
 if(phase==='inspect')return {...checked,browserConnected:false};
 if(phase!=='verify'&&checked.errors.length)throw Error('AK preflight failed: '+checked.errors.map(x=>x.code).join(','));
 return withLock('ak-job:'+key,async()=>{
  let rec=await readRecord(file);if(phase==='prepare'&&rec)throw new OpsError('RECONCILE_REQUIRED','Existing AK upload must be reconciled, never uploaded again',2);
  if(phase!=='prepare'&&!rec)throw Error('No reserved AK job');
  return browser(async c=>{
   const pages=c.pages().filter(p=>{try{return HOSTS[job.channel].includes(new URL(p.url()).hostname);}catch{return false;}});if(pages.length>1)throw Error('Ambiguous native account tabs');const p=pages[0]||await c.newPage();await p.bringToFront();p.setDefaultTimeout(20000);
   if(!pages.length||phase==='verify')await p.goto(job.account.listURL,{waitUntil:'domcontentloaded'});await assertAKAccount(p,job);
   if(phase==='prepare'){
    const reservation=await reserveAKPackage(job,registryFile);if(reservation.errors.length)throw Error('Persistent AK reservation refused');rec={operationId:key,reservation,job,status:'reserved_before_upload',at:asOf};await writeJSON(file,rec);
    try{await adapter.prepare(p,job);await adapter.preflight(p,job);rec.status='prepared_native';await writeJSON(file,rec);}catch(e){rec.status='unknown_upload_reconcile_only';await writeJSON(file,rec);e.preservePage=true;throw e;}
   }else if(phase==='submit'){
    if(rec.status!=='prepared_native')throw new OpsError('RECONCILE_REQUIRED','AK submit is not retryable',2);if(job.liveAdapterApproved!==true)throw new OpsError('LIVE_VALIDATION_REQUIRED','Native preflight required for new AK adapter',3);
    await adapter.preflight(p,job);rec.status='submitted_reconcile_only';rec.submittedAt=new Date().toISOString();await writeJSON(file,rec);await adapter.submit(p,job);
   }else{
    const proof=await require('./ak-readback').readback(p,job);rec.proof=proof;rec.status=proof.status;await writeJSON(file,rec);
   }
   await withLock('media-registry:'+registryFile,async()=>{const rows=JSON.parse(await fs.readFile(registryFile,'utf8'));for(const x of rows)if(x.operationId===rec.reservation.operationId)Object.assign(x,{outcome:rec.status,evidence:file,nativeURL:rec.proof?.url||null});await writeJSON(registryFile,rows);});
   return {status:rec.status,channel:job.channel,evidence:file,operationId:key,proof:rec.proof||null,automaticRetry:false};
  });
 });
}
module.exports={runAKJob,assertURL,assertAKAccount};
