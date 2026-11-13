'use strict';
const {OpsError,assertNoChallenge}=require('../ops');
const HOSTS={douyin:['creator.douyin.com','www.douyin.com'],bilibili:['member.bilibili.com','www.bilibili.com'],tiktok:['www.tiktok.com'],youtube:['studio.youtube.com','www.youtube.com'],x:['x.com']};
async function page(context,job) {
 const matches=context.pages().filter(p=>HOSTS[job.channel].includes(new URL(p.url()).hostname));
 if(matches.length>1)throw Error('Multiple platform tabs; preserve and disambiguate before publishing');
 const p=matches[0]||await context.newPage();await p.bringToFront();p.setDefaultTimeout(20000);p.setDefaultNavigationTimeout(45000);
 if(!matches.length)await p.goto(job.account.listURL,{waitUntil:'domcontentloaded'});return p;
}
async function assertAccount(p,job) {
 await assertNoChallenge(p);
 const matches=async q=>{const proof=q.locator(job.account.ownerSelector).filter({visible:true});return await proof.count()===1&&(await proof.innerText()).includes(job.account.ownerText);};
 const check=async q=>{
  if(await matches(q))return true;
  if(!job.account.ownerRevealSelector)return false;
  const toggle=q.locator(job.account.ownerRevealSelector).filter({visible:true});if(await toggle.count()!==1)return false;
  await toggle.click();try{await q.locator(job.account.ownerSelector).first().waitFor({state:'visible',timeout:5000});return await matches(q);}catch{return false;}finally{await toggle.click();}
 };
 if(await check(p))return;
 const target=job.account.proofURL || job.account.listURL;const host=new URL(target);if(host.protocol!=='https:'||!HOSTS[job.channel].includes(host.hostname))throw Error('Untrusted native account proof URL');
 const probe=await p.context().newPage();let preserve=false;
 try{await probe.bringToFront();await probe.goto(target,{waitUntil:'domcontentloaded',timeout:45000});await assertNoChallenge(probe);if(!job.account.ownerRevealSelector)await probe.locator(job.account.ownerSelector).filter({hasText:job.account.ownerText}).first().waitFor({timeout:25000});if(!await check(probe))throw new OpsError('ACCOUNT_UNVERIFIED','Native account identity not confirmed; login/identity check needed',3);}
 catch(e){preserve=true;e.preservePage=true;throw e;}
 finally{if(!preserve){await probe.close();await p.bringToFront();}}
}
async function uniqueButton(scope,name) {
 const b=scope.getByRole('button',{name,exact:true}).filter({visible:true});await b.first().waitFor({state:'visible',timeout:20000});if(await b.count()!==1)throw Error('Ambiguous button '+name);return b;
}
function durationMatches(text,expected){
 const times=[...text.matchAll(/(?:^|\n)(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?=\n|$)/g)].map(m=>Number(m[1]||0)*3600+Number(m[2])*60+Number(m[3]));
 return Number.isFinite(expected)&&times.some(n=>Math.abs(n-expected)<2);
}
const norm=s=>s.replace(/[\s\u200B-\u200D\uFEFF]/g,'');
async function assertText(locator,expected) {if(norm(await locator.innerText())!==norm(expected))throw Error('Native editor text differs');}
async function proofFromList(p,job,{rowSelector,titleSelector,urlSelector,mediaSelector,publicText,reviewText}) {
 await p.goto(job.account.listURL,{waitUntil:'domcontentloaded'});await p.locator(rowSelector).first().waitFor({timeout:30000});
 const rows=p.locator(rowSelector).filter({hasText:job.title});try{await rows.first().waitFor({timeout:25000});}catch{return {state:'unknown',observedAt:new Date().toISOString()};}if(await rows.count()!==1)return {state:'unknown',observedAt:new Date().toISOString()};
 const row=rows.first(),text=await row.innerText();const underReview=reviewText?.test(text);
 const title=row.locator(titleSelector);if(await title.count()!==1||norm(await title.innerText())!==norm(job.title))return {state:'unknown',observedAt:new Date().toISOString()};
 if(!publicText.test(text)&&!underReview)return {state:'unknown',reason:'native_row_not_public',nativeText:text,observedAt:new Date().toISOString()};
 const link=row.locator(urlSelector).first();if(!await link.count())return {state:underReview?'pending_review':'unknown',reason:'native_permalink_absent',nativeText:text,observedAt:new Date().toISOString()};
 const url=await link.getAttribute('href');if(!url)return {state:'unknown',reason:'native_permalink_absent',observedAt:new Date().toISOString()};let resolved;try{resolved=new URL(url,p.url());}catch{return {state:'unknown',observedAt:new Date().toISOString()};}
 if(resolved.protocol!=='https:'||!HOSTS[job.channel].includes(resolved.hostname))return {state:'unknown',observedAt:new Date().toISOString()};
 const media=await row.locator(mediaSelector).count()>0 && durationMatches(text,job.expectedDurationSeconds);
 return {state:underReview?'pending_review':media?'published':'unknown',url:resolved.href,identityVerified:true,contentVerified:true,mediaVerified:media,observedAt:new Date().toISOString(),nativeText:text};
}
module.exports={page,assertAccount,uniqueButton,norm,assertText,proofFromList,durationMatches};
