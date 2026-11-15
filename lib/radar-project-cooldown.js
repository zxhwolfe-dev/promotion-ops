'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const DEFAULT_HISTORY=path.resolve(__dirname,'../../promotion-reporting/radar-project-history.json');
function projectKey(raw){let s=String(raw||'').trim().toLowerCase();if(/^https?:/.test(s)){const u=new URL(s);if(u.hostname!=='github.com')throw Error('Expected original GitHub project identity');s=u.pathname.replace(/^\/+|\/+$/g,'');}return s.replace(/\.git$/,'').replaceAll('/','-');}
function recentProjectConflicts({history,projectIds,publicationDate,episodeId,cooldownDays=30}){
 if(!Array.isArray(history)||!Array.isArray(projectIds)||!/^\d{4}-\d{2}-\d{2}$/.test(publicationDate)||cooldownDays!==30)throw Error('Project cooldown needs explicit source identities, date and approved30-day window');
 const end=Date.parse(publicationDate+'T00:00:00+08:00'),cutoff=end-cooldownDays*86400000,keys=new Set(projectIds.map(projectKey)),conflicts=[];
 for(const r of history){if(episodeId&&r.episodeId===episodeId)continue;const time=Date.parse((r.publicationDate||'')+'T00:00:00+08:00');if(!Number.isFinite(time)||time<cutoff||time>end)continue;for(const id of r.projectIds||[])if(keys.has(projectKey(id)))conflicts.push({projectId:id,previousEpisode:r.episodeId||null,previousDate:r.publicationDate,channels:r.publishedChannels||null});}
 return conflicts;
}
async function assertProjectCooldown({data,historyFile=DEFAULT_HISTORY}){
 const history=JSON.parse(await fs.readFile(historyFile,'utf8'));if(!Array.isArray(data.projects)||!data.projects.length)throw Error('Original project identities required before new Radar jobs');
 const conflicts=recentProjectConflicts({history,projectIds:data.projects.map(p=>p.id),publicationDate:data.publicationDate,episodeId:'ep'+data.episode+'-radar-daily'});if(conflicts.length)throw Error('Projects already featured in the last30 days; reselect before publication: '+conflicts.map(x=>x.projectId+'@'+x.previousDate).join(', '));return{status:'passed',cooldownDays:30,conflicts:[]};
}
module.exports={projectKey,recentProjectConflicts,assertProjectCooldown,DEFAULT_HISTORY};
