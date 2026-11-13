'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {dailyRun}=require('../../lib/daily-runner');
const {withBrowser}=require('../../lib/cdp');
const {readRecord}=require('../../lib/state');
const {runVideoJob}=require('../../lib/publishers/video-job');
const adapters=Object.fromEntries(['douyin','bilibili','tiktok','youtube','x'].map(x=>[x,require('../../lib/publishers/'+x+'-video')]));
async function publish(job,o){const key=crypto.createHash('sha256').update(JSON.stringify([job.channel,job.account.id,job.episodeId,job.sha256])).digest('hex');const file=path.join(o.stateRoot,'video-jobs',key+'.json');let previous=await readRecord(file);const invoke=phase=>runVideoJob({job:{...job,liveAdapterApproved:true},phase,...o,adapters,browser:withBrowser});if(!previous){await invoke('prepare');previous=await readRecord(file);}return invoke(previous.status==='prepared_native'?'submit':'verify');}
async function main(args=process.argv.slice(2)){let configFile,mode='plan',asOf=new Date().toISOString();for(let i=0;i<args.length;i++){if(args[i]==='--config')configFile=args[++i];else if(args[i]==='--mode')mode=args[++i];else if(args[i]==='--as-of')asOf=args[++i];else throw Error('Usage: --config file --mode plan|build|publish --as-of ISO');}if(!configFile)throw Error('Local config required');return dailyRun({config:JSON.parse(await fs.readFile(configFile,'utf8')),mode,asOf,dependencies:{publish}});}
if(require.main===module)main().then(r=>{console.log(JSON.stringify({date:r.date,status:r.status,results:r.results,failures:r.failures,needsHuman:r.needsHuman},null,2));process.exitCode=['blocked','partial_no_automatic_retry'].includes(r.status)?2:0;}).catch(e=>{console.error(e.message);process.exitCode=1;});module.exports={main};
