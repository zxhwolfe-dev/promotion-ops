'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile),{validateConfig}=require('./codex-ops-contract'),{writeJSON}=require('./state');
const OLD=['promotion-radar-build.timer','promotion-radar-publish.timer'];
function units({node,script,configFile,workspace,environmentFile}){
 const quote=s=>{if(/[\n\r%]/.test(s))throw Error('Unsafe systemd path');return '"'+s.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';};quote(workspace);if(environmentFile)quote(environmentFile);const out={};
 for(const [slot,time]of [['day','10:00:00'],['evening','19:45:00']]){
  const name='promotion-codex-'+slot;
  out[name+'.service']=`[Unit]\nDescription=Local model-led promotion operations (${slot})\n\n[Service]\nType=oneshot\nWorkingDirectory=${workspace}\nUMask=0077\n${environmentFile?'EnvironmentFile='+environmentFile+'\n':''}Environment=\"PROMO_STATE_DIR=${os.homedir()}/.promotion-ops\"\nExecStart=${[node,script,'--config',configFile,'--slot',slot].map(quote).join(' ')}\nTimeoutStartSec=7500\nKillMode=control-group\nRestart=no\n`;
  out[name+'.timer']=`[Unit]\nDescription=Model-led promotion ${slot} at ${time} Shanghai\n\n[Timer]\nOnCalendar=*-*-* ${time} Asia/Shanghai\nPersistent=false\nUnit=${name}.service\n\n[Install]\nWantedBy=timers.target\n`;
 }return out;
}
async function installSchedule({configFile,dependencies={}}){
 const c=validateConfig(JSON.parse(await fs.readFile(configFile,'utf8')));if(c.liveEnabled!==true||!c.threadId||!c.probeEvidence)throw Error('Enable only after the actual readonly probe');
 const proof=await fs.readFile(c.probeEvidence);if(require('node:crypto').createHash('sha256').update(proof).digest('hex')!==c.probeSHA256||(()=>{const p=JSON.parse(proof);return p.status!=='probe_verified'||p.threadId!==c.threadId||p.model!==c.model||p.probe!==true||p.turnCompleted!==true||p.platformOperations!==false;})())throw Error('Activation probe does not match');
 const systemctl=dependencies.systemctl||((args)=>exec('systemctl',['--user',...args]));
 for(const n of OLD.map(x=>x.replace('.timer','.service'))){const r=await systemctl(['show',n,'-p','ActiveState','--value']);if(['active','activating','deactivating'].includes(r.stdout.trim()))throw Error('Existing Radar work is running; no timer changes');}
 const unitDir=dependencies.unitDir||path.join(os.homedir(),'.config/systemd/user'),backup=path.join(c.stateRoot,'schedule-backup-'+new Date().toISOString().replaceAll(':','-'));await fs.mkdir(backup,{recursive:true,mode:0o700});
 const generated=units({node:process.execPath,script:path.resolve(__dirname,'../scripts/ops/run-codex.js'),configFile,workspace:c.workspace,environmentFile:c.environmentFile});
 const preview=path.join(backup,'preview');await fs.mkdir(preview);for(const [name,text]of Object.entries(generated))await fs.writeFile(path.join(preview,name),text,{mode:0o600});await (dependencies.verify||((files)=>exec('systemd-analyze',['--user','verify',...files])))(Object.keys(generated).map(name=>path.join(preview,name)));
 const prior={};for(const name of [...OLD,...Object.keys(generated)]){const p=path.join(unitDir,name);try{await fs.copyFile(p,path.join(backup,name));}catch(e){if(e.code!=='ENOENT')throw e;}if(name.endsWith('.timer')){const r=await systemctl(['is-enabled',name]).catch(e=>({stdout:e.stdout||''}));prior[name]=r.stdout.trim();}}
 await writeJSON(path.join(backup,'prior.json'),prior);
 try{await fs.mkdir(unitDir,{recursive:true});for(const [name,text]of Object.entries(generated))await fs.writeFile(path.join(unitDir,name),text,{mode:0o600});await systemctl(['daemon-reload']);await systemctl(['disable','--now',...OLD]);await systemctl(['enable','--now','promotion-codex-day.timer','promotion-codex-evening.timer']);for(const name of ['promotion-codex-day.timer','promotion-codex-evening.timer']){const r=await systemctl(['show',name,'-p','ActiveState','--value']);if(r.stdout.trim()!=='active')throw Error('New timer enabled but not actually active: '+name);}}
 catch(e){await systemctl(['disable','--now','promotion-codex-day.timer','promotion-codex-evening.timer']).catch(()=>{});for(const name of Object.keys(generated)){try{await fs.copyFile(path.join(backup,name),path.join(unitDir,name));}catch(x){if(x.code==='ENOENT')await fs.rm(path.join(unitDir,name),{force:true});else throw x;}}await systemctl(['daemon-reload']);for(const [name,status]of Object.entries(prior))if(status==='enabled')await systemctl(['enable','--now',name]);throw e;}
 await writeJSON(path.join(c.stateRoot,'schedule.json'),{installedAt:new Date().toISOString(),times:{day:'10:00 Asia/Shanghai',evening:'19:45 Asia/Shanghai'},oldTimersStopped:OLD,newTimers:['promotion-codex-day.timer','promotion-codex-evening.timer'],backup,persistent:false});return{status:'installed',backup};
}
module.exports={units,installSchedule};
