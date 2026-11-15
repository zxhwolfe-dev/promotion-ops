'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {withLock,writeJSON,readRecord}=require('./state');
const {validateConfig,outputSchema,promptFor,UUID}=require('./codex-ops-contract');
const {OWNER_FILE}=require('./ops-owner');
const dayAt=now=>new Date(Date.parse(now)+8*3600000).toISOString().slice(0,10);
async function validateResult(c,result,{runId,date,slot,probe,startedAt}){
 if(c.threadId&&result.threadId!==c.threadId)throw Error('Dedicated thread continuation mismatch');
 const r=result.final;if(result.turnCompleted!==true||!UUID.test(result.threadId||'')||r.runId!==runId||r.date!==date||r.slot!==slot||!['completed','partial','needs_human'].includes(r.status)||typeof r.summary!=='string'||!r.summary.trim()||!Array.isArray(r.needsHuman))throw Error('Native turn identity or final result mismatch');
 if(probe){if(r.readOnlyVerified!==true||r.platformOperations!==false||r.status!=='completed')throw Error('Read-only activation probe incomplete');return;}
 if(r.status==='needs_human'&&!r.needsHuman.length)throw Error('Human-needed result must name the actual blocker');
 if(r.status!=='needs_human'){
  const policy=JSON.parse(await fs.readFile(c.policyFile,'utf8'));for(const [key,field]of [['currentRun','receiptFile'],['latestDailyMetrics','metricsFile'],['latestDailyHandoff','handoffFile']]){
   if(!path.isAbsolute(r[field]||'')||!policy[key])throw Error('Current daily pointers differ from final result');
   const file=await fs.realpath(r[field]),root=await fs.realpath(c.creativeRoot),reference=await fs.realpath(path.resolve(path.dirname(c.policyFile),policy[key]));if(!file.startsWith(root+path.sep)||reference!==file)throw Error('Current daily pointers differ from final result');
   const st=await fs.stat(file);if(!st.isFile()||st.mtimeMs<Date.parse(startedAt))throw Error('Daily evidence was not refreshed in this run');
   if(field!=='handoffFile'){const data=JSON.parse(await fs.readFile(file,'utf8'));if(data.date!==date)throw Error('Daily evidence date mismatch');if(field==='receiptFile'&&data.orchestratorRunId!==runId)throw Error('Receipt not tied to this operation');}
  }
 }
}
async function runCodexOps({configFile,slot,probe=false,dryRun=false,continuationOf=null,now=new Date().toISOString(),dependencies={}}){
 if(!['day','evening'].includes(slot)||!Number.isFinite(Date.parse(now)))throw Error('Valid slot and ISO clock required');
 const c=validateConfig(JSON.parse(await fs.readFile(configFile,'utf8'))),date=dayAt(now);
 if(!probe&&slot==='evening'&&new Date(Date.parse(now)+8*3600000).toISOString().slice(11,16)<'19:45')throw Error('Evening operations are not due before19:45 Shanghai');
 if(dryRun)return {status:'planned_no_model_no_browser',date,slot,threadId:c.threadId||null,model:c.model,liveEnabled:c.liveEnabled===true};
 if(!probe){if(c.liveEnabled!==true||!c.threadId||!c.probeEvidence||!c.probeSHA256)throw Error('Verified activation is required');const bytes=await fs.readFile(c.probeEvidence);if(crypto.createHash('sha256').update(bytes).digest('hex')!==c.probeSHA256||(()=>{const p=JSON.parse(bytes);return p.status!=='probe_verified'||p.threadId!==c.threadId||p.model!==c.model||p.probe!==true||p.turnCompleted!==true||p.platformOperations!==false;})())throw Error('Activation probe changed or unverified');}
 let previous=null;if(continuationOf){if(probe||!UUID.test(continuationOf))throw Error('Explicit same-day continuation ID required');previous=await readRecord(path.join(c.stateRoot,'runs',date+'-'+slot,'run.json'));if(!previous||previous.runId!==continuationOf||previous.date!==date||previous.slot!==slot||previous.probe||!['partial','needs_human','failed_requires_reconciliation'].includes(previous.status))throw Error('Continuation must refer to this day/slot existing incomplete run');}
 const lock=dependencies.lock||withLock;
 return lock('promotion-autonomous-operations',async()=>{
  const runId=crypto.randomUUID(),directory=path.join(c.stateRoot,'runs',probe?'probe-'+runId:date+'-'+slot+(continuationOf?'-continue-'+continuationOf:'')),recordFile=path.join(directory,'run.json');
  if(await readRecord(recordFile))throw Error('This slot already attempted; inspect existing results, never automatically repeat it');
  const ownerFile=dependencies.ownerFile||OWNER_FILE;if(await readRecord(ownerFile))throw Error('Existing operation owner requires reconciliation');
  const startedAt=new Date().toISOString();const record={version:1,runId,date,slot,probe,status:'reserved_before_codex_start',startedAt,threadId:c.threadId||null,model:c.model,originalConversationId:c.parentThreadId,continuationOf};
  const claim=async()=>{await writeJSON(ownerFile,{runId,status:'running',pid:process.pid,startedAt});await writeJSON(recordFile,record);};
  // Claim ownership while no registered browser writer is active, then release the CDP lock.
  await lock(require('./cdp').endpointConfig().lockKey,claim);
  try{
   if(!probe){record.browserPreflight=await (dependencies.browserPreflight||require('./promotion-browser-preflight').ensurePromotionBrowser)();await writeJSON(recordFile,record);}
   await writeJSON(path.join(directory,'schema.json'),outputSchema());const prompt=promptFor(c,{runId,date,slot,probe,browserPreflight:record.browserPreflight,continuationOf});await fs.writeFile(path.join(directory,'prompt.txt'),prompt,{mode:0o600});record.status='codex_running';await writeJSON(recordFile,record);
   const result=await (dependencies.execute||require('./codex-ops-process').executeCodex)(c,{directory,prompt,probe,runId});
   await validateResult(c,result,{runId,date,slot,probe,startedAt});Object.assign(record,{status:probe?'probe_verified':result.final.status,threadId:result.threadId,finishedAt:new Date().toISOString(),summary:result.final.summary,needsHuman:result.final.needsHuman,turnCompleted:true,platformOperations:result.final.platformOperations});if(!probe)record.assessment=await require('./codex-ops-assessment').assessRun(c,record,{receiptFile:result.final.receiptFile});await writeJSON(recordFile,record);
   if(probe){c.threadId=result.threadId;c.probeEvidence=recordFile;c.probeSHA256=crypto.createHash('sha256').update(await fs.readFile(recordFile)).digest('hex');c.liveEnabled=false;await writeJSON(configFile,c);}
   await writeJSON(path.join(c.stateRoot,'latest.json'),record);return record;
  }catch(e){Object.assign(record,{status:'failed_requires_reconciliation',finishedAt:new Date().toISOString(),error:String(e.message).split('\n')[0],details:e.runDetails||null,automaticRetry:false});await writeJSON(recordFile,record);await writeJSON(path.join(c.stateRoot,'latest.json'),record);throw e;}
  finally{const owner=await readRecord(ownerFile);if(owner?.runId===runId)await fs.unlink(ownerFile);}
 });
}
module.exports={runCodexOps,validateResult,dayAt};
