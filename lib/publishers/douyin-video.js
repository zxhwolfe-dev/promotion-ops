'use strict';
const common=require('./native-video-common');
const {uploadCover}=require('./douyin-cover');
const title=p=>p.getByPlaceholder('填写作品标题，为作品获得更多流量');
const editor=p=>p.locator('[contenteditable=true]').first();
async function finishCovers(p,j){await uploadCover(p,j.verticalCoverPath,'vertical');await uploadCover(p,j.coverPath,'horizontal');if(!await p.getByText('不同时发布',{exact:true}).locator('..').locator('input').isChecked())await p.getByText('不同时发布',{exact:true}).locator('..').click();}
async function prepare(p,j){
 if(!j.verticalCoverPath||!j.coverPath)throw Error('Both cover sizes required');
 await p.goto('https://creator.douyin.com/creator-micro/content/upload',{waitUntil:'domcontentloaded'});await p.locator('input[type=file]').first().waitFor({state:'attached'});
 if(!(await p.locator('body').innerText()).includes('上传视频'))throw Error('Preserve existing uploader');await p.locator('input[type=file]').first().setInputFiles(j.videoPath);
 await title(p).waitFor({timeout:60000});await title(p).fill(j.title);await editor(p).fill(j.caption);await editor(p).press('Tab');
 const tip=p.getByText('我知道了',{exact:true});if(await tip.isVisible().catch(()=>false))await tip.click();
 await p.getByText('请选择自主声明',{exact:true}).click();await p.locator('label.semi-radio').filter({hasText:'内容由AI生成'}).click();await (await common.uniqueButton(p,'确定')).click();
 await finishCovers(p,j);
}
async function resumePreparation(p,j){
 if(!p.url().includes('/content/post/video')||await title(p).inputValue()!==j.title)throw Error('Existing upload identity differs');await common.assertText(editor(p),j.caption);await finishCovers(p,j);
 // The cover editor unmounts the video player. Read the native preview only after it closes.
 await p.getByText('预览视频',{exact:true}).click();await p.locator('video').first().waitFor({state:'attached',timeout:20000});
 await p.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>Number.isFinite(v.duration)&&v.readyState>=1),null,{timeout:20000});
 const durations=await p.locator('video').evaluateAll(es=>es.map(e=>e.duration));if(!durations.some(x=>Math.abs(x-j.expectedDurationSeconds)<2))throw Error('Existing native video duration differs');
}
async function preflight(p,j){
 await p.waitForFunction(()=>!document.body.innerText.includes('封面检测中'),null,{timeout:120000});
 if(await title(p).inputValue()!==j.title)throw Error('Title mismatch');await common.assertText(editor(p),j.caption);
 if(!await p.getByText('不同时发布',{exact:true}).locator('..').locator('input').isChecked())throw Error('Crossposting enabled');
 if(!await p.getByText('公开',{exact:true}).locator('..').locator('input').isChecked()||!await p.getByText('立即发布',{exact:true}).locator('..').locator('input').isChecked())throw Error('Privacy/timing differs');
 const text=await p.locator('body').innerText();if(!text.includes('内容由AI生成')||text.includes('横/竖双封面缺失'))throw Error('AI/cover missing');
 if(text.includes('请勿使用截屏当封面')||text.includes('封面存在3个问题'))throw Error('Native cover quality warning; preserve upload for visual correction');
}
async function submit(p){await (await common.uniqueButton(p,'发布')).click();await p.waitForURL(/\/content\/manage/,{timeout:60000});}
async function readback(p,j){
 await p.goto(j.account.listURL,{waitUntil:'domcontentloaded'});if(!j.nativeListSelectors)throw Error('Validated list row selectors required');
 const row=p.locator(j.nativeListSelectors.rowSelector).filter({hasText:j.title});await row.waitFor({timeout:30000});if(await row.count()!==1)return {state:'unknown',observedAt:new Date().toISOString()};
 const text=await row.innerText();if(text.includes('审核中'))return {state:'pending_review',observedAt:new Date().toISOString()};
 if(!text.includes('已发布'))return {state:'unknown',observedAt:new Date().toISOString()};
 const context=p.context(),before=new Set(context.pages());const opened=context.waitForEvent('page',{timeout:15000,predicate:q=>!before.has(q)}).catch(()=>null);await row.locator(j.nativeListSelectors.titleSelector).click();
 let detail=await opened;if(!detail)detail=context.pages().find(q=>!before.has(q));
 if(!detail)return {state:'unknown',observedAt:new Date().toISOString()};
 try{await detail.waitForURL(/\/work-detail\/\d+/,{timeout:25000});await detail.getByText('作品状态正常',{exact:true}).waitFor({timeout:25000});const id=/\/work-detail\/(\d+)/.exec(detail.url())?.[1];if(!id)throw Error('No native work ID');return {state:'published',url:'https://www.douyin.com/video/'+id,identityVerified:true,contentVerified:(await detail.locator('body').innerText()).includes(j.title),mediaVerified:common.durationMatches(text,j.expectedDurationSeconds),observedAt:new Date().toISOString(),nativeText:text};}
 finally{await detail.close();await p.bringToFront();}
}
module.exports={...common,prepare,resumePreparation,preflight,submit,readback};
