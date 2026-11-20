'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile);
const {withLock,writeJSON}=require('./state');
const {timestamp,localDay}=require('./daily-execution');
const {main:planMain}=require('../scripts/ops/daily-execution-plan');
const {consistencyAudit}=require('./ops-consistency');
const {assertProjectCooldown}=require('./radar-project-cooldown');
const ROOT=path.resolve(__dirname,'..');
async function dailyRun({config,asOf,mode='plan',dependencies={}}){
 const now=timestamp(asOf);if(now===null||!['plan','build'].includes(mode))throw Error('Daily run supports only manual plan/build with an explicit ISO clock');const day=localDay(now);
 if(mode!=='plan')await require('./ops-owner').assertOpsOwner();
 if(!config.policyFile||!config.stateRoot||!config.outputRoot)throw Error('Explicit local policy, state root and output root required');
 return withLock('promotion-daily:'+path.resolve(config.stateRoot),async()=>{
  const run={version:1,date:day,asOf,mode,status:'running',executionScope:'manual_plan_or_radar_build',platformOperations:false,results:[],skipped:[],failures:[],needsHuman:[]};const policy=JSON.parse(await fs.readFile(config.policyFile,'utf8'));const audit=consistencyAudit({policyFile:config.policyFile,asOf});
  const output=path.join(config.outputRoot,day);await fs.mkdir(output,{recursive:true});
  try{
   if(audit.status!=='passed')throw Error('Operating contract consistency failed: '+audit.errors.join('; '));
   run.plan=planMain(['--as-of',asOf,'--policy',config.policyFile]).result;
   if(mode==='plan'){run.status='planned_no_browser_or_publication';return run;}
   const generation=await (dependencies.build||buildDaily)({config,day,output});run.generation=generation;
   if(policy.videoReleaseQueue&&generation.jobs?.length)await (dependencies.registerJobs||require('./release-registration').registerJobs)(policy.videoReleaseQueue,generation.jobs,asOf);
   run.status='built_only_no_publication';return run;
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
  await assertProjectCooldown({data,historyFile:config.projectHistory});
  await execute(config.videoPython,[path.join(ROOT,'scripts/radar/build_episode.py'),'--input',path.join(adopted.packageRoot,'episode-input.json'),'--output',adopted.packageRoot,'--verify-only'],{timeout:300000,maxBuffer:1024*1024});
  const qa=JSON.parse(await fs.readFile(path.join(adopted.packageRoot,'package-quality.json'),'utf8'));if(qa.status!=='passed')throw Error('Adopted package QA missing');
  const jobs=await require('./radar-job-pack').buildJobPack({data,qa,packageRoot:adopted.packageRoot,accounts:config.accounts||{},day,historyFile:config.projectHistory,queueFile:JSON.parse(await fs.readFile(config.policyFile,'utf8')).videoReleaseQueue});return {sourceDate:day,episode:data.episode,packageRoot:adopted.packageRoot,jobs,reusedDailyPackage:true};
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
 await assertProjectCooldown({data,historyFile:config.projectHistory});
 await execute(config.videoPython,[path.join(ROOT,'scripts/radar/build_episode.py'),'--input',input,'--output',packageRoot,'--synthesize','--render'],{timeout:1800000,maxBuffer:1024*1024,env:{...process.env,PROMO_VIDEO_FONT_DIR:config.fontDir||'/mnt/c/Windows/Fonts'}});
 const qa=JSON.parse(await fs.readFile(path.join(packageRoot,'package-quality.json'),'utf8'));if(qa.status!=='passed')throw Error('Bilingual quality package incomplete');
 const jobs=await require('./radar-job-pack').buildJobPack({data,qa,packageRoot,accounts:config.accounts||{},day,historyFile:config.projectHistory,queueFile:JSON.parse(await fs.readFile(config.policyFile,'utf8')).videoReleaseQueue});
 await writeJSON(path.join(output,'jobs.json'),jobs);await writeJSON(adoptedFile,{packageRoot,episode:data.episode,sourceDate:day,preparedAt:new Date().toISOString()});return {sourceDate:day,episode:data.episode,packageRoot,jobs};
}
module.exports={dailyRun,buildDaily};
