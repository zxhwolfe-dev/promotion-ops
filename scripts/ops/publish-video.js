'use strict';
const fs=require('node:fs'),path=require('node:path');
const {withBrowser}=require('../../lib/cdp');
const {runVideoJob}=require('../../lib/publishers/video-job');
const adapters=Object.fromEntries(['douyin','bilibili','tiktok','youtube','x'].map(c=>[c,require('../../lib/publishers/'+c+'-video')]));
async function main(args=process.argv.slice(2)) {
 let jobFile,phase='inspect',stateRoot,registryFile;
 for(let i=0;i<args.length;i++){const k=args[i];if(k==='--job')jobFile=args[++i];else if(k==='--phase')phase=args[++i];else if(k==='--state-root')stateRoot=args[++i];else if(k==='--registry')registryFile=args[++i];else throw Error('Usage: --job file --phase inspect|prepare|resume-preparation|submit|verify --state-root dir --registry file');}
 if(!jobFile)throw Error('Job required');const job=JSON.parse(fs.readFileSync(jobFile,'utf8'));
 if(phase==='inspect')return {status:'validated_local_only',job:await require('../../lib/publishers/video-job').validateJob(job),browserConnected:false};
 if(!job.queueFile)throw Error('A registered authoritative release queue is required for native operations');
 if(!stateRoot||!registryFile)throw Error('Explicit local state and global media registry required');
 return runVideoJob({job,phase,stateRoot:path.resolve(stateRoot),registryFile:path.resolve(registryFile),adapters,browser:withBrowser});
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(require('../../lib/ops').errorResult(e));process.exitCode=e.exitCode||1;});
module.exports={main};
