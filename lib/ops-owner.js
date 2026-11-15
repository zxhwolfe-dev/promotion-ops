'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {OpsError}=require('./ops');
const OWNER_FILE=path.join(os.homedir(),'.local/share/promotion-ops/codex-orchestrator/active.json');
async function assertOpsOwner({file=OWNER_FILE,env=process.env}={}){
 let r;try{r=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return;throw new OpsError('OPS_OWNER_UNKNOWN','运营互斥记录不可读，先核对现有任务',4);}
 if(r.status!=='running'||!r.runId)throw new OpsError('OPS_OWNER_UNKNOWN','运营互斥记录无效，先核对现有任务',4);
 if(env.PROMO_ORCHESTRATOR_RUN_ID!==r.runId)throw new OpsError('OPS_RUNNING','Codex正在执行运营任务；先核对该轮结果，不并发操作账号',4,{startedAt:r.startedAt});
}
module.exports={assertOpsOwner,OWNER_FILE};
