'use strict';
const {decodedAttachmentMatches}=require('../decoded-attachment');
const {assertURL}=require('./ak-job');
const norm=s=>s.replace(/[\s\u200B-\u200F\uFEFF]/g,'');
async function readback(p,j){
 let url=j.nativeURL;
 if(!url){await p.goto(j.account.listURL,{waitUntil:'domcontentloaded'});if(!j.account.rowSelector)throw Error('Known permalink or validated owner list selectors required');const row=p.locator(j.account.rowSelector).filter({hasText:j.caption.split('\n')[0]});await row.waitFor({timeout:30000});if(await row.count()!==1)return {status:'unknown_reconcile_only'};url=await row.locator(j.account.urlSelector).first().getAttribute('href');url=new URL(url,p.url()).href;}
 const original=assertURL(url,j.channel);const routes={weibo:/^\/\d+\/[a-zA-Z0-9]+\/?$/,toutiao:/^\/w\/\d+\/?$/,taoguba:/^\/a\/[a-zA-Z0-9]+\/?$/};if(!routes[j.channel].test(original.pathname))throw Error('Not an original post URL');await p.goto(url,{waitUntil:'domcontentloaded'});const content=p.locator(j.account.contentSelector);await content.waitFor({timeout:30000});if(await content.count()!==1)throw Error('Ambiguous original content');
 const text=await content.innerText();if(/当前内容正在审核中|审核中/.test(text))return {status:'pending_review',url};if(/内容不存在|帖子不存在|当前内容不适合展示|内容已被删除/.test(text))return {status:'restricted_not_public',url};
 const images=content.locator(j.account.imageSelector);for(let i=0;i<await images.count();i++)await images.nth(i).scrollIntoViewIfNeeded();const decoded=await images.evaluateAll(es=>es.map(e=>({width:e.naturalWidth,height:e.naturalHeight,complete:e.complete,src:e.currentSrc})));
 const nativePublished=j.channel==='weibo'?/(?:^|\n)公开(?:\n|$)/.test(text):j.channel==='taoguba'?/淘股吧原创/.test(text):false;
 const media=decoded.length===3&&decoded.every((x,i)=>decodedAttachmentMatches(x,j.reports[i]));const caption=norm(text).includes(norm(j.caption));const author=!!j.account.publicAuthor&&text.includes(j.account.publicAuthor);
 return {status:nativePublished&&media&&caption&&author?'published_native_verified_external_unknown':'unknown_reconcile_only',url,mediaVerified:media,captionMatches:caption,authorMatches:author,images:decoded,observedAt:new Date().toISOString(),note:'Owner view only; an anonymous original check is still required before external-public reporting. Three matching ratios alone do not prove pixel identity.'};
}
module.exports={readback};
