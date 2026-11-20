'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {writeJSON,withLock}=require('./state');
const {contentFormat,editorialPrompt}=require('./editorial-contract');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function ordered(x){return Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;}
function identity(job){const copy={...job};delete copy.operationKey;delete copy.expectedDurationSeconds;return hash(JSON.stringify(ordered(copy)));}
async function snapshot(files,root){const base=await fs.realpath(root),result=[];for(const name of [...new Set(files)]){const file=await fs.realpath(name);if(!file.startsWith(base+path.sep)||!/\.(?:json|txt|md|png|jpe?g|webp|mp4|srt|wav)$/.test(file)||/\/(?:\.env|cookies|credentials)(?:[/.]|$)/i.test(file))throw Error('Review file outside approved content scope');const stat=await fs.stat(file);if(!stat.isFile()||stat.size>128*1024*1024)throw Error('Review file too large or not regular');result.push({file,sha256:hash(await fs.readFile(file))});}return result;}
function reviewSchema(){const properties={contentId:{type:'string'},manifestHash:{type:'string'},decision:{type:'string',enum:['approve','revise']},audienceValue:{type:'string'},openingReview:{type:'string'},factualReview:{type:'string'},visualReview:{type:'string'},issues:{type:'array',items:{type:'string'}},suggestions:{type:'array',items:{type:'string'}}};return{type:'object',properties,required:Object.keys(properties),additionalProperties:false};}
async function reviewContent({c,manifest,manualRepairAuthorization=null,execute=require('./editorial-process').executeReview}){
 if(process.env.PROMO_REVIEW_ONLY==='1')throw Error('Reviewer cannot start another reviewer');
 if(manualRepairAuthorization&&(typeof manualRepairAuthorization!=='string'||!manualRepairAuthorization.trim()))throw Error('Manual repair requires a direct user instruction');
 if(!/^[a-z0-9][a-z0-9._-]{1,100}$/.test(manifest.contentId||'')||!/^\d{4}-\d{2}-\d{2}$/.test(manifest.date||'')||!manifest.brief?.audience||!manifest.brief?.viewerTask||!manifest.brief?.opening||!manifest.brief?.whyThisContent||!Array.isArray(manifest.jobFiles)||!manifest.jobFiles.length||!Array.isArray(manifest.previewImages)||!manifest.previewImages.length||manifest.previewImages.length>6)throw Error('Audience/task/opening rationale, jobs and1–6 real preview images required');
 const initial=await snapshot([...(manifest.files||[]),...manifest.jobFiles,...manifest.previewImages],c.creativeRoot);
 const jobs=await Promise.all(manifest.jobFiles.map(async f=>JSON.parse(await fs.readFile(f,'utf8'))));
 if(jobs.some(j=>j.publicationDate!==manifest.date))throw Error('Review content date differs from publication jobs');
 const format=contentFormat(jobs);
 const media=jobs.flatMap(j=>[j.videoPath,j.coverPath,j.verticalCoverPath,...(j.imagePaths||[]),...(j.reports||[]).map(r=>r.path)].filter(Boolean));
 const files=await snapshot([...(manifest.files||[]),...manifest.jobFiles,...manifest.previewImages,...media],c.creativeRoot),manifestHash=hash(JSON.stringify({manifest,files}));
 if(initial.some(x=>files.find(y=>y.file===x.file)?.sha256!==x.sha256))throw Error('Review sources changed while loading jobs');
 const dir=path.join(c.reviewRoot,manifestHash);
 return withLock('editorial-review:'+manifest.date+':'+manifest.contentId,async()=>{const attemptsFile=path.join(c.reviewRoot,'attempts',hash(manifest.date+manifest.contentId)+'.json');let attempts=[];try{attempts=JSON.parse(await fs.readFile(attemptsFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}const previousReview=attempts.length?JSON.parse(await fs.readFile(path.join(c.reviewRoot,attempts.at(-1).manifestHash,'result.json'),'utf8')):null;const coverAmendment=!!manualRepairAuthorization&&attempts.length===3&&await require('./editorial-cover-amendment').isCoverOnlyAmendment(previousReview,jobs);if(attempts.length>=2&&!(manualRepairAuthorization&&attempts.length===2&&!attempts.some(x=>x.manualRepairAuthorization))&&!coverAmendment)throw Error('Two reviews already attempted for this content; stop and report');await writeJSON(attemptsFile,[...attempts,{manifestHash,at:new Date().toISOString(),...(manualRepairAuthorization?{manualRepairAuthorization}: {})}]);await fs.mkdir(dir,{recursive:true,mode:0o700});try{await fs.access(path.join(dir,'started.json'));throw Error('Existing review preserved; read its result instead of rerunning');}catch(e){if(e.code!=='ENOENT')throw e;}
  await writeJSON(path.join(dir,'started.json'),{at:new Date().toISOString(),manifestHash,contentId:manifest.contentId});await writeJSON(path.join(dir,'input.json'),{manifest,files,format,previousReview:previousReview?{decision:previousReview.decision,issues:previousReview.issues,suggestions:previousReview.suggestions||[],audienceValue:previousReview.audienceValue,openingReview:previousReview.openingReview,factualReview:previousReview.factualReview,visualReview:previousReview.visualReview}:null});await writeJSON(path.join(dir,'schema.json'),reviewSchema());
  const prompt=editorialPrompt({model:c.model,effort:c.effort,inputFile:path.join(dir,'input.json'),contentId:manifest.contentId,manifestHash,format});
  const result=await execute(c,{directory:dir,prompt,imagePaths:manifest.previewImages});
  const r=result.final;if(result.turnCompleted!==true||!result.threadId||r.contentId!==manifest.contentId||r.manifestHash!==manifestHash||!['approve','revise'].includes(r.decision)||!Array.isArray(r.issues)||!Array.isArray(r.suggestions)||[...r.issues,...r.suggestions].some(x=>typeof x!=='string'||!x.trim())||(r.decision==='revise'&&!r.issues.length)||['audienceValue','openingReview','factualReview','visualReview'].some(k=>typeof r[k]!=='string'||!r[k].trim())||(r.decision==='approve'&&r.issues.length))throw Error('Independent native review response invalid');
  const after=await snapshot(files.map(x=>x.file),c.creativeRoot);if(JSON.stringify(after)!==JSON.stringify(files))throw Error('Content changed during independent review');
  const record={...r,format,...(manualRepairAuthorization?{manualRepairAuthorization}:{}),threadId:result.threadId,model:c.model,effort:c.effort,turnCompleted:true,readOnly:true,files,reviewedAt:new Date().toISOString()};await writeJSON(path.join(dir,'result.json'),record);
  if(r.decision==='approve')for(const job of jobs)await writeJSON(path.join(c.publisherStateRoot,'editorial-approvals',identity(job)+'.json'),{reviewFile:path.join(dir,'result.json'),identity:identity(job),publicationDate:job.publicationDate});
  return{decision:r.decision,issues:r.issues,suggestions:r.suggestions,evidence:path.join(dir,'result.json'),additionalPublishing:false};
 });
}
async function assertApproved(job,stateRoot){
 const approvalFile=path.join(stateRoot,'editorial-approvals',identity(job)+'.json');
 let approval;
 try{approval=JSON.parse(await fs.readFile(approvalFile,'utf8'));}
 catch(error){if(error.code==='ENOENT')throw Error('Independent editorial approval missing for this job');throw error;}
 const r=JSON.parse(await fs.readFile(approval.reviewFile,'utf8'));
 if(approval.identity!==identity(job)||approval.publicationDate!==job.publicationDate||r.decision!=='approve'||r.turnCompleted!==true||r.readOnly!==true||r.issues.length)throw Error('Independent editorial approval missing or stale');
 for(const x of r.files)if(hash(await fs.readFile(x.file))!==x.sha256)throw Error('Reviewed content changed; stop before uploading or publishing');
}
module.exports={identity,snapshot,reviewSchema,reviewContent,assertApproved};
