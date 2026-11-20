'use strict';
const fs=require('node:fs/promises');
// A native platform can reject a cover after the video has already passed review.
// This permits one user-directed cover correction, never another refused-video retry.
async function isCoverOnlyAmendment(previous,jobs){
 if(previous?.decision!=='approve'||jobs.length!==1)return false;
 const current=jobs[0],plain=j=>Object.fromEntries(Object.entries(j).filter(([k])=>!['coverPath','verticalCoverPath'].includes(k)));
 const canonical=x=>JSON.stringify(Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))));
 for(const f of previous.files||[]){
  if(!f.file.endsWith('.json'))continue;
  let old;try{const raw=await fs.readFile(f.file);if(require('node:crypto').createHash('sha256').update(raw).digest('hex')!==f.sha256)continue;old=JSON.parse(raw);}catch{continue;}
  if(old.channel!==current.channel||old.episodeId!==current.episodeId||!old.videoPath)continue;
  if(canonical(plain(old))!==canonical(plain(current)))continue;
  if(old.coverPath===current.coverPath&&old.verticalCoverPath===current.verticalCoverPath)return false;
  return true;
 }
 return false;
}
module.exports={isCoverOnlyAmendment};
