'use strict';
const fs=require('node:fs'),path=require('node:path');
const {validateContract}=require('./operating-contract');
const {videoReleasePlan}=require('./video-release-queue');
function consistencyAudit({policyFile,asOf}) {
  const policy=JSON.parse(fs.readFileSync(policyFile,'utf8')),errors=[],warnings=[];
  try {validateContract(policy.activeContract);} catch(e){errors.push(e.message);}
  let queue,plan;
  try {queue=JSON.parse(fs.readFileSync(path.resolve(path.dirname(policyFile),policy.videoReleaseQueue),'utf8'));plan=videoReleasePlan(queue,asOf);
    if(JSON.stringify(queue.currentCounts)!==JSON.stringify(plan.counts.byStatus))errors.push('Queue cached counts differ from item-derived counts');
  }catch(e){errors.push(e.message);}
  const dates=[];
  for(const key of ['currentRun','latestDailyMetrics']) {
    try {const data=JSON.parse(fs.readFileSync(path.resolve(path.dirname(policyFile),policy[key]),'utf8'));if(!data.date)errors.push(key+' has no run date');else dates.push(data.date);}
    catch(e){errors.push(key+': '+e.message);}
  }
  if(new Set(dates).size>1)errors.push('Latest receipt and metrics refer to different run dates');
  if(dates[0] && dates[0]!==new Date(Date.parse(asOf)+8*3600000).toISOString().slice(0,10))warnings.push('Latest verified run is '+dates[0]+'; no current-day completion is inferred');
  if(policy.currentConstraints20261111)errors.push('Obsolete dated constraints still compete with activeContract');
  for(const key of ['latestDailyHandoff','channelRegistry'])if(!policy[key]||!fs.existsSync(policy[key]))errors.push('Missing current pointer '+key);
  if(policy.latestDailyHandoff&&fs.existsSync(policy.latestDailyHandoff)){
    const heading=fs.readFileSync(policy.latestDailyHandoff,'utf8').split('\n',1)[0];
    const day=/\d{4}-\d{2}-\d{2}/.exec(heading)?.[0]||/\d{4}-\d{2}-\d{2}/.exec(path.dirname(policy.latestDailyHandoff))?.[0];
    if(day&&dates[0]&&day!==dates[0])errors.push('Latest handoff date differs from receipt date');
    if(!day)warnings.push('Latest handoff has no verifiable date');
  }
  return {status:errors.length?'failed':'passed',readOnly:true,errors,warnings,counts:plan?.counts || null,latestRunDate:dates[0] || null};
}
module.exports={consistencyAudit};
