'use strict';
const common=require('./native-video-common');
const {assertNoChallenge,OpsError}=require('../ops');
function assertNativeIdentity(payload,account){
 if(!/^\d+$/.test(String(account.nativeUid||''))||payload?.code!==0||payload.data?.isLogin!==true||String(payload.data.mid)!==String(account.nativeUid)||payload.data.uname!==account.publicAuthor)throw new OpsError('ACCOUNT_UNVERIFIED','Bilibili native UID/login/author does not match configured account',3);
}
async function assertAccount(p,j){
 await assertNoChallenge(p);const response=await p.request.get('https://api.bilibili.com/x/web-interface/nav',{timeout:15000});
 if(!response.ok())throw new OpsError('ACCOUNT_UNVERIFIED','Bilibili native account read unavailable',3);assertNativeIdentity(await response.json(),j.account);
}
const title=p=>p.getByPlaceholder('请输入稿件标题',{exact:true});
const description=p=>p.locator('.ql-editor[contenteditable=true]:visible');
async function finishTags(p,j){
 const category=p.locator('.video-human-type:visible');if((await category.locator('.select-item-cont').innerText()).trim()!=='人工智能'){await category.locator('.select-controller').click();await category.locator('.drop-list-v2-item[title="人工智能"]').click();}
 while(await p.locator('.label-item-v2-container:visible').count()){const row=p.locator('.label-item-v2-container:visible').first();await row.hover();await row.locator('svg.close').click();}
 for(const tag of j.tags){const input=p.getByPlaceholder('按回车键Enter创建标签',{exact:true}).filter({visible:true});await input.fill(tag);await input.press('Enter');await p.waitForFunction(t=>[...document.querySelectorAll('.label-item-v2-content')].some(e=>e.textContent.trim()===t),tag,{timeout:10000});}
}
async function prepare(p,j){
 if(!j.coverPath||!Array.isArray(j.tags)||!j.tags.length)throw Error('Cover and tags required');
 await p.goto('https://member.bilibili.com/platform/upload/video/frame',{waitUntil:'domcontentloaded'});await p.getByText('点击上传或将视频拖拽到此区域',{exact:true}).waitFor({timeout:30000});
 await p.locator('input[type=file][accept*=".mp4"]').first().setInputFiles(j.videoPath);await title(p).waitFor({timeout:60000});await title(p).fill(j.title);await description(p).fill(j.caption);
 await p.getByPlaceholder('请选择符合您视频内容的创作声明',{exact:true}).click();await p.getByText('含AI生成内容',{exact:true}).click();await p.getByText('标签',{exact:true}).filter({visible:true}).click();
 await p.getByText('添加封面',{exact:true}).filter({visible:true}).click();await p.locator('.cover-editor-panel-select-item:visible input[type=file][accept="image/png, image/jpeg"]').setInputFiles(j.coverPath);await p.getByText('完成',{exact:true}).filter({visible:true}).click();
 await p.getByText('上传完成',{exact:true}).first().waitFor({timeout:120000});await finishTags(p,j);
}
async function resumePreparation(p,j){
 // Only finish metadata for this journal's existing upload; never select another file.
 const filename=require('node:path').basename(j.videoPath,'.mp4');
 if(!p.url().startsWith('https://member.bilibili.com/platform/upload/video/frame')||await title(p).inputValue()!==j.title||!(await p.locator('body').innerText()).includes(filename))throw Error('Existing upload identity differs; preserve it');
 await common.assertText(description(p),j.caption);await p.getByText('上传完成',{exact:true}).first().waitFor({timeout:10000});await finishTags(p,j);
}
async function preflight(p,j){
 if(await title(p).inputValue()!==j.title)throw Error('Title differs');await common.assertText(description(p),j.caption);
 if(await p.getByPlaceholder('请选择符合您视频内容的创作声明',{exact:true}).inputValue()!=='含AI生成内容'||(await p.locator('.video-human-type .select-item-cont:visible').innerText()).trim()!=='人工智能')throw Error('Declaration/category differs');
 if(await p.locator('.time-container .switch-container-active').count())throw Error('Unexpected appointment');
 const tags=await p.locator('.label-item-v2-content:visible').allInnerTexts();if(!j.tags.every(t=>tags.includes(t)))throw Error('Tags differ');
}
async function submit(p){await p.getByText('立即投稿',{exact:true}).filter({visible:true}).click();await p.getByText('稿件投递成功',{exact:true}).waitFor({timeout:60000});await p.getByText('查看进度',{exact:true}).filter({visible:true}).click();await p.getByText('稿件处理进度',{exact:true}).waitFor({timeout:30000});return {nativeStage:'processing_progress',observedAt:new Date().toISOString(),url:p.url()};}
async function readback(p,j){
 if(!j.nativeListSelectors)throw Error('Validated native list selectors required');
 return common.proofFromList(p,j,{...j.nativeListSelectors,publicText:/\d{4}年\d{2}月\d{2}日/,reviewText:/审核中|转码中|处理中/});
}
module.exports={...common,assertAccount,assertNativeIdentity,prepare,resumePreparation,preflight,submit,readback};
