'use strict';
const fs=require('node:fs');
const {withBrowser}=require('../../lib/cdp');
const {runAKJob}=require('../../lib/publishers/ak-job');
async function main(args=process.argv.slice(2)){const o={phase:'inspect'};for(let i=0;i<args.length;i++){const k={'--job':'jobFile','--phase':'phase','--registry':'registryFile','--state-root':'stateRoot'}[args[i]];if(!k)throw Error('Usage: --job file --phase inspect|prepare|submit|verify --registry file --state-root dir');o[k]=args[++i];}if(!o.jobFile||!o.registryFile||!o.stateRoot)throw Error('Explicit job, registry and state root required');return runAKJob({...o,job:JSON.parse(fs.readFileSync(o.jobFile,'utf8')),browser:withBrowser});}
if(require.main===module)main().then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(require('../../lib/ops').errorResult(e));process.exitCode=e.exitCode||1;});module.exports={main};
