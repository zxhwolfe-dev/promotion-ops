'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile);
const {withLock,writeJSON}=require('./state');
const {timestamp,localDay}=require('./daily-execution');
const {main:planMain}=require('../scripts/ops/daily-execution-plan');
const {consistencyAudit}=require('./ops-consistency');
const ROOT=path.resolve(__dirname,'..');
async function dailyRun({config,asOf,mode='plan',dependencies={}}){
 const now=timestamp(asOf);if(now===null||!['plan','build','publish'].includes(mode))throw Error('Explicit ISO clock and plan/build/publish mode required');const day=localDay(now);
 if(!config.policyFile||!config.stateRoot||!config.outputRoot)throw Error('Explicit local policy, state root and output root required');
 return withLock('promotion-daily:'+path.resolve(config.stateRoot),async()=>{
  const run={version:1,date:day,asOf,mode,status:'running',platformOperations:false,results:[],failures:[],needsHuman:[]};const policy=JSON.parse(await fs.readFile(config.policyFile,'utf8'));const audit=consistencyAudit({policyFile:config.policyFile,asOf});
  const output=path.join(config.outputRoot,day);await fs.mkdir(output,{recursive:true});
  try{
   if(audit.status!=='passed')throw Error('Operating contract consistency failed: '+audit.errors.join('; '));
   const args=['--as-of',asOf,'--policy',config.policyFile];if(policy.currentRun)args.push('--receipt',policy.currentRun);if(policy.latestDailyMetrics)args.push('--snapshot',policy.latestDailyMetrics);run.plan=planMain(args).result;
   if(mode==='plan'){run.status='planned_no_browser_or_publication';return run;}
   if(mode==='publish'&&config.activation?.publishEnabled!==true)throw Error('Unattended publishing gate is not enabled; use build or plan');
   const generation=await (dependencies.build||buildDaily)({config,day,output});run.generation=generation;
   if(policy.videoReleaseQueue&&generation.jobs?.length)await (dependencies.registerJobs||require('./release-registration').registerJobs)(policy.videoReleaseQueue,generation.jobs,asOf);
   if(mode==='build'){run.status='built_only_no_publication';return run;}
   for(const job of generation.jobs){
    const task=run.plan.current.find(t=>t.channel===job.channel);
    if(task?.status==='complete'){run.results.push({channel:job.channel,status:'already_complete_today_not_republished'});continue;}
    const validation=await (dependencies.validateAdapter||require('./native-adapter-validation').validateNativeAdapter)(job.channel,config);
    if(validation.valid!==true){const q=JSON.parse(await fs.readFile(policy.videoReleaseQueue,'utf8')),existing=q.items.find(x=>x.id===job.episodeId+':'+job.channel);run.failures.push({channel:job.channel,reason:validation.reason||'native_adapter_not_yet_validated',automationSkipped:true,existingStatus:existing?.status||null});continue;}
    try{let result=await dependencies.publish(job,{stateRoot:config.stateRoot,registryFile:config.registryFile});run.results.push(result);run.platformOperations=true;if(['published_native_verified','published_native_verified_external_unknown'].includes(result.status))await (dependencies.recordProjects||require('./radar-project-history').recordPublishedProjects)({historyFile:config.projectHistory,job,result,packageRoot:generation.packageRoot});}
    catch(e){const x={channel:job.channel,code:e.code||'PUBLISH_FAILED',reason:String(e.message).split('\n')[0]};run.failures.push(x);if(e.exitCode===3)run.needsHuman.push(x);}
   }
   run.status=run.failures.length?'partial_no_automatic_retry':run.results.some(x=>!['published_native_verified','already_complete_today_not_republished'].includes(x.status))?'awaiting_native_or_public_verification':'completed_available_jobs';return run;
  }catch(e){run.status='blocked';run.failures.push({reason:String(e.message).split('\n')[0]});return run;}
  finally{run.finishedAt=new Date().toISOString();const history=path.join(output,'runs',run.finishedAt.replaceAll(':','-')+'-'+mode+'.json');await writeJSON(history,run);await writeJSON(path.join(output,'run.json'),run);await fs.writeFile(path.join(output,'report.txt'),require('./daily-report').dailyReport(run));await writeJSON(path.join(config.stateRoot,'latest-run.json'),{date:day,report:history,status:run.status});}
 });
}
async function buildDaily({config,day,output}){
 const adoptedFile=path.join(config.stateRoot,'daily-packages',day+'.json');
 let adopted=null;
 try{adopted=JSON.parse(await fs.readFile(adoptedFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(adopted){
  const data=JSON.parse(await fs.readFile(path.join(adopted.packageRoot,'episode-input.json'),'utf8'));
  if(data.publicationDate!==day||data.sourceDate!==day)throw Error('Adopted package date mismatch');
  await execute(config.videoPython,[path.join(ROOT,'scripts/radar/build_episode.py'),'--input',path.join(adopted.packageRoot,'episode-input.json'),'--output',adopted.packageRoot,'--verify-only'],{timeout:300000,maxBuffer:1024*1024});
  const qa=JSON.parse(await fs.readFile(path.join(adopted.packageRoot,'package-quality.json'),'utf8'));if(qa.status!=='passed')throw Error('Adopted package QA missing');
  const jobs=await require('./radar-job-pack').buildJobPack({data,qa,packageRoot:adopted.packageRoot,accounts:config.accounts||{},day,queueFile:JSON.parse(await fs.readFile(config.policyFile,'utf8')).videoReleaseQueue});return {sourceDate:day,episode:data.episode,packageRoot:adopted.packageRoot,jobs,reusedDailyPackage:true};
 }
 let input=path.join(output,'source','episode-input.json');const packageRoot=path.join(output,'video');let data;
 try{data=JSON.parse(await fs.readFile(input,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;const queue=JSON.parse(await fs.readFile(JSON.parse(await fs.readFile(config.policyFile,'utf8')).videoReleaseQueue,'utf8'));const episode=Math.max(0,...queue.items.map(x=>x.episode))+1;
  const capture=require('../scripts/radar/capture-daily').captureDaily;
  const options={date:day,episode,output:path.dirname(input),historyFile:config.projectHistory,executable:config.anonymousBrowser,ranking:config.ranking||'daily'};
  try{data=await capture(options);}catch(e){
   if(!e.message.startsWith('Fewer than six') || options.ranking!=='daily')throw e;
   input=path.join(output,'source-newcomer','episode-input.json');
   try{data=JSON.parse(await fs.readFile(input,'utf8'));}catch(f){if(f.code!=='ENOENT')throw f;data=await capture({...options,output:path.dirname(input),ranking:'newcomer'});}
  }
 }
 if(data.publicationDate!==day||data.sourceDate!==day)throw Error('Generation input is stale; no date relabeling');
 await execute(config.videoPython,[path.join(ROOT,'scripts/radar/build_episode.py'),'--input',input,'--output',packageRoot,'--synthesize','--render'],{timeout:1800000,maxBuffer:1024*1024,env:{...process.env,PROMO_VIDEO_FONT_DIR:config.fontDir||'/mnt/c/Windows/Fonts'}});
 const qa=JSON.parse(await fs.readFile(path.join(packageRoot,'package-quality.json'),'utf8'));if(qa.status!=='passed')throw Error('Bilingual quality package incomplete');
 const jobs=await require('./radar-job-pack').buildJobPack({data,qa,packageRoot,accounts:config.accounts||{},day,queueFile:JSON.parse(await fs.readFile(config.policyFile,'utf8')).videoReleaseQueue});
 await writeJSON(path.join(output,'jobs.json'),jobs);await writeJSON(adoptedFile,{packageRoot,episode:data.episode,sourceDate:day,preparedAt:new Date().toISOString()});return {sourceDate:day,episode:data.episode,packageRoot,jobs};
}
module.exports={dailyRun,buildDaily};
