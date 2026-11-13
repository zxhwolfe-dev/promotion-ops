'use strict';
const path=require('node:path');
const {consistencyAudit}=require('../../lib/ops-consistency');
function main(args=process.argv.slice(2)) {
 const o={policyFile:path.resolve(__dirname,'../../../promotion-current-policy.json'),asOf:new Date().toISOString()};
 for(let i=0;i<args.length;i++){if(args[i]==='--policy')o.policyFile=path.resolve(args[++i]);else if(args[i]==='--as-of')o.asOf=args[++i];else throw Error('Usage: --policy file --as-of ISO');}
 return consistencyAudit(o);
}
if(require.main===module){try{const r=main();console.log(JSON.stringify(r,null,2));process.exitCode=r.status==='passed'?0:1;}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={main};
