'use strict';
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
async function executeCodex(c,{directory,prompt,probe,runId}){
 const args=['--no-daemon','-a','never','-s',probe?'read-only':'workspace-write','-C',c.workspace,'-c',`model_reasoning_effort="${c.effort}"`];
 if(!probe)args.push('-c','sandbox_workspace_write.network_access=true','--add-dir',c.creativeRoot,'--add-dir',c.stateRoot,'--add-dir',c.publisherStateRoot||path.join(path.dirname(c.stateRoot),'automation'),'--add-dir',path.join(require('node:os').homedir(),'.promotion-ops'));
 args.push('exec','--output-schema',path.join(directory,'schema.json'));if(c.threadId)args.push('resume',c.threadId);
 args.push('--model',c.model,'--json','-o',path.join(directory,'final.json'),'-');
 const env={...process.env,PATH:path.dirname(c.codex)+path.delimiter+(process.env.PATH||'/usr/bin:/bin'),PROMO_ORCHESTRATOR_RUN_ID:runId};delete env.CODEX_THREAD_ID;delete env.CODEX_SESSION_ID;
 const out=fs.createWriteStream(path.join(directory,'events.jsonl'),{mode:0o600}),err=fs.createWriteStream(path.join(directory,'stderr.log'),{mode:0o600});
 const events=[];let pending='',bytes=0,reason=null,killTimer,child;
 const stop=why=>{if(reason)return;reason=why;try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},5000);};
 const result=await new Promise((resolve,reject)=>{
  child=spawn(c.codex,args,{cwd:c.workspace,env,stdio:['pipe','pipe','pipe'],detached:true});
  const timer=setTimeout(()=>stop('time_limit_requires_reconciliation'),c.maxMillis||7200000);
  const interrupted=()=>stop('interrupted_requires_reconciliation');process.once('SIGTERM',interrupted);process.once('SIGINT',interrupted);
  const cleanup=()=>{clearTimeout(timer);clearTimeout(killTimer);process.removeListener('SIGTERM',interrupted);process.removeListener('SIGINT',interrupted);};
  child.stdout.on('data',b=>{bytes+=b.length;if(bytes>32*1024*1024){stop('output_limit_requires_reconciliation');return;}out.write(b);pending+=b;const lines=pending.split('\n');pending=lines.pop();for(const line of lines){try{const e=JSON.parse(line);if(['thread.started','turn.started','turn.completed','turn.failed','error'].includes(e.type))events.push(e);}catch{}}});
  child.stderr.on('data',b=>err.write(b));child.stdin.on('error',()=>{});child.stdin.end(prompt);
  child.once('error',e=>{cleanup();reject(e);});child.once('close',(exitCode,signal)=>{cleanup();resolve({exitCode,signal,reason,events});});
 });
 await Promise.all([new Promise(r=>out.end(r)),new Promise(r=>err.end(r))]);
 const threadId=events.find(x=>x.type==='thread.started')?.thread_id;
 if(result.exitCode!==0||result.reason||!events.some(x=>x.type==='turn.completed')||events.some(x=>['turn.failed','error'].includes(x.type)))throw Object.assign(Error(result.reason||'Codex did not produce a verified completed turn'),{runDetails:{exitCode:result.exitCode,signal:result.signal,events:events.map(e=>({type:e.type,thread_id:e.thread_id})),threadId}});
 const final=JSON.parse(await fsp.readFile(path.join(directory,'final.json'),'utf8'));return {threadId,final,exitCode:result.exitCode,turnCompleted:true};
}
module.exports={executeCodex};
