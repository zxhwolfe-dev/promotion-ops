'use strict';
const fs=require('node:fs/promises'),path=require('node:path');const {withLock,writeJSON}=require('./state');
async function recordPublishedProjects({historyFile,job,result,packageRoot}){
 if(!['published_native_verified','published_native_verified_external_unknown'].includes(result.status))return false;
 if(!historyFile||!packageRoot)throw Error('Published project history location missing');
 const data=JSON.parse(await fs.readFile(path.join(packageRoot,'episode-input.json'),'utf8'));
 if(job.episodeId!=='ep'+data.episode+'-radar-daily'||data.publicationDate!==job.publicationDate)throw Error('Published project source identity differs');
 if(!result.proof?.identityVerified||!result.proof?.contentVerified||!result.proof?.mediaVerified||!result.proof.url)throw Error('Published project proof incomplete');
 return withLock('radar-project-history:'+historyFile,async()=>{const rows=JSON.parse(await fs.readFile(historyFile,'utf8'));let row=rows.find(x=>x.episodeId===job.episodeId);const ids=data.projects.map(x=>x.id);if(row&&JSON.stringify(row.projectIds)!==JSON.stringify(ids))throw Error('Published episode projects changed');if(!row){row={episodeId:job.episodeId,publicationDate:job.publicationDate,projectIds:ids,publishedChannels:[]};rows.push(row);}row.publishedChannels=[...new Set([...(row.publishedChannels||[]),job.channel])];row.lastEvidence=result.evidence;await writeJSON(historyFile,rows);return true;});
}
module.exports={recordPublishedProjects};
