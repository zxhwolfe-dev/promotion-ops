'use strict';
// Separate anonymous browser: never use the authenticated CDP context for this check.
async function publicOriginal(job,proof,{chromium=require('playwright-core').chromium,executable=process.env.PROMO_TEST_BROWSER}={}) {
 if(!executable||!job.account.publicAuthor)return {verified:false,reason:'public_probe_not_configured'};
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});
 try{const p=await browser.newPage();await p.goto(proof.url,{waitUntil:'domcontentloaded',timeout:30000});await p.locator('video').first().waitFor({timeout:15000});await p.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.readyState>=1&&Number.isFinite(v.duration)),null,{timeout:15000});
 const body=await p.locator('body').innerText();if(/Site Maintenance|Oops! Something went wrong|内容不存在|安全验证|内容不适合展示|审核中/i.test((await p.title())+' '+body))return {verified:false,reason:'public_unavailable_or_review'};
 const title=job.channel==='tiktok'?job.caption.slice(0,50):job.title;
 const videos=await p.locator('video').evaluateAll(es=>es.map(e=>({duration:e.duration,ready:e.readyState})));
 return {verified:body.includes(title)&&body.includes(job.account.publicAuthor)&&videos.some(v=>v.ready>=1&&Math.abs(v.duration-job.expectedDurationSeconds)<2),url:p.url(),observedAt:new Date().toISOString(),reason:'anonymous_original_title_author_video_check'};
 }catch{return {verified:false,reason:'public_probe_failed_unknown'};}finally{await browser.close();}
}
module.exports={publicOriginal};
