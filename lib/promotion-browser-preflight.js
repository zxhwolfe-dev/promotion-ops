'use strict';
// Used when an authorized manual session needs the fixed Chrome profile.
// Only the user-authorized Chrome executable/profile may be launched, at most once.
const fs=require('node:fs/promises'),{spawn}=require('node:child_process');
const ENDPOINT='http://127.0.0.1:9234';
const EXE='/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';
const ARGS=['--remote-debugging-port=9234',String.raw`--user-data-dir=C:\Users\zxhwo\AppData\Local\AIWorkstationPromotionBrowser`,'--no-first-run'];
async function discover(){try{const r=await fetch(ENDPOINT+'/json/version',{signal:AbortSignal.timeout(5000)});const b=await r.json();return {available:r.ok&&/^Chrome\//.test(b.Browser||''),responded:true};}catch(e){return{available:false,responded:false,reason:e.name||'discovery_failed'};}}
async function interop(env=process.env,stat=fs.stat){for(const p of [env.WSL_INTEROP,'/run/WSL/1_interop']){if(!p||!p.startsWith('/run/WSL/'))continue;try{if((await stat(p)).isSocket())return p;}catch{}}return null;}
async function launch(executable,args,env){await fs.access(executable);return new Promise((resolve,reject)=>{const child=spawn(executable,args,{env,detached:true,stdio:'ignore'});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});}
async function ensurePromotionBrowser(deps={}){
 const probe=deps.discover||discover,first=await probe();if(first.available)return{status:'ready',available:true,launchAttempted:false,endpoint:ENDPOINT};
 if(first.responded)return{status:'needs_human',available:false,launchAttempted:false,reason:'Debug port responded without a verified Chrome identity'};
 const socket=await (deps.interop||interop)();const env={...process.env};if(socket)env.WSL_INTEROP=socket;
 try{await (deps.launch||launch)(EXE,[...ARGS],env);}catch(e){return{status:'needs_human',available:false,launchAttempted:true,reason:'Authorized Chrome launcher failed: '+(e.code||e.name||'unknown')};}
 for(let i=0;i<8;i++){await (deps.sleep||((ms)=>new Promise(r=>setTimeout(r,ms))))(1000);if((await probe()).available)return{status:'ready',available:true,launchAttempted:true,endpoint:ENDPOINT,interopSocket:socket||null};}
 return{status:'needs_human',available:false,launchAttempted:true,reason:'Authorized Chrome started once but CDP did not become ready; preserve existing profile/processes'};
}
module.exports={ensurePromotionBrowser,interop,ENDPOINT,EXE,ARGS};
