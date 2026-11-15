'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const NATIVE=new Set(['published_native_verified','published_native_verified_external_unknown']);
async function assessRun(c,run,{receiptFile}={}){
 if(!run||run.probe)return {applicable:false,reason:'No formal operation to assess'};
 const issues=[],native=[],externalUnknown=[],deferred=[],dispositions=[];
 try{
  const policy=JSON.parse(await fs.readFile(c.policyFile,'utf8'));
  const file=receiptFile||path.resolve(path.dirname(c.policyFile),policy.currentRun);
  const receipt=JSON.parse(await fs.readFile(file,'utf8'));
  if(receipt.date!==run.date||receipt.orchestratorRunId!==run.runId)return {applicable:false,reason:'Latest daily receipt belongs to another run; do not infer this run completion'};
  const seen=new Set();
  for(const row of [...(receipt.publiclyPublished||[]),...(receipt.otherSubmissions||[])]){
   if(row.publicationDate!==run.date||!row.nativeVerified||!NATIVE.has(row.status))continue;
   const key=[row.channel,row.episodeId,row.url].join('|');if(seen.has(key))continue;seen.add(key);
   if(row.episodeId&&row.kind!=='radar_daily_three_images'){
    try{const j=JSON.parse(await fs.readFile(row.evidence,'utf8'));const p=j.proof;
     if(!NATIVE.has(j.status)||j.channel!==row.channel||j.episodeId!==row.episodeId||j.job?.publicationDate!==run.date||j.job?.sha256!==row.sha256||p?.url!==row.url||p.identityVerified!==true||p.contentVerified!==true||p.mediaVerified!==true)throw Error('Journal identity, source or native proof differs');
    }catch(e){issues.push({channel:row.channel,reason:e.message});continue;}
   }
   native.push({channel:row.channel,url:row.url,publicVerified:row.publicVerified===true});
   if(row.publicVerified!==true)externalUnknown.push(row.channel);
  }
  for(const item of receipt.pending||[])if(/^deferred_/.test(item.status||''))deferred.push(item.channel);
  const expected=(policy.activeContract?.daily||[]).filter(x=>run.slot==='day'?!x.notBefore:!!x.notBefore);
  for(const task of expected){
   if(native.some(x=>x.channel===task.channel))continue;
   const skip=receipt.channelDispositions?.[task.channel];
   if(run.slot==='evening'&&skip?.status==='skipped_nontrading_unchanged_source_package'&&skip.reason&&skip.evidence){
    try{await fs.access(skip.evidence);dispositions.push({channel:task.channel,status:skip.status,evidence:skip.evidence});continue;}catch{}
   }
   issues.push({channel:task.channel,reason:'This slot has no verified native publication or evidenced allowed skip'});
  }
  const human=[...new Set([...(run.needsHuman||[]),...(receipt.needsHuman||[])])];
  return {applicable:true,modelTurnCompleted:run.turnCompleted===true,originalStatus:run.status,slot:run.slot,
   routinePublishingAccountedFor:issues.length===0,nativeVerified:native,externalVisibilityUnknown:[...new Set(externalUnknown)],
   deferredToEvening:[...new Set(deferred)],evidencedSkips:dispositions,needsHuman:human,issues,
   canContinueRoutineAutomatically:run.turnCompleted===true&&!human.length&&!issues.length,
   growthEffectiveness:'not_established',meaning:'Routine execution, anonymous public visibility and promotion effectiveness are separate; original partial/failed status is preserved'};
 }catch(e){return {applicable:true,canContinueRoutineAutomatically:false,issues:[{reason:e.message}],growthEffectiveness:'not_established'};}
}
module.exports={assessRun};
