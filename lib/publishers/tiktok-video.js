'use strict';
const common=require('./native-video-common');
const editor=p=>p.locator('[contenteditable=true][role=combobox]');
async function finishMetadata(p,j){
 const filename=require('node:path').basename(j.videoPath,'.mp4');const before=(await editor(p).innerText()).trim();
 if(before&&before!==filename&&common.norm(before)!==common.norm(j.caption))throw Error('Preserve unrelated nonempty description');
 await editor(p).fill('');await editor(p).click();await p.keyboard.insertText(j.caption);await editor(p).press('Tab');
 await common.assertText(editor(p),j.caption);const more=p.getByText('显示更多',{exact:true});if(await more.isVisible())await more.click();
 for(const key of ['disclose_content_container','aigc_container']){const row=p.locator('[data-e2e='+key+']');if(!await row.locator('input').isChecked())await row.locator('.Switch__content').click();}
 const brand=p.getByText('你的品牌',{exact:true}).locator('..');if(!await brand.locator('input').isChecked())await brand.locator('label').click();
}
async function prepare(p,j){
 await p.goto('https://www.tiktok.com/tiktokstudio/upload',{waitUntil:'domcontentloaded'});await p.locator('input[type=file]').waitFor({state:'attached',timeout:30000});
 if(!(await p.locator('body').innerText()).includes('选择要上传的视频'))throw Error('Existing native upload preserved');
 await p.locator('input[type=file]').setInputFiles(j.videoPath);await p.getByText(/已上传（/).waitFor({timeout:120000});await editor(p).waitFor();
 await finishMetadata(p,j);
}
async function resumePreparation(p,j){const filename=require('node:path').basename(j.videoPath);if(!p.url().startsWith('https://www.tiktok.com/tiktokstudio/upload')||!(await p.locator('body').innerText()).includes(filename))throw Error('Existing upload identity differs');await p.getByText(/已上传（/).waitFor({timeout:10000});await finishMetadata(p,j);}
async function preflight(p,j){
 await common.assertText(editor(p),j.caption);for(const key of ['disclose_content_container','aigc_container'])if(!await p.locator('[data-e2e='+key+'] input').isChecked())throw Error('AI/brand disclosure absent');
 if(!await p.getByText('你的品牌',{exact:true}).locator('..').locator('input').isChecked())throw Error('Own-brand not selected');
 const text=await p.locator('body').innerText();if(!text.includes('所有人')||!text.includes('现在')||text.includes('发现问题，请'))throw Error('Privacy/publish/check incomplete');
}
async function submit(p){await (await common.uniqueButton(p,'发布')).click();await p.getByText('视频已发布',{exact:true}).waitFor({timeout:60000});await p.waitForLoadState('networkidle',{timeout:30000});return {nativeStage:'published_notice',observedAt:new Date().toISOString(),url:p.url()};}
async function readback(p,j){
 // TikTok's published description is the primary content field; job title need not appear.
 if(!j.nativeListSelectors)throw Error('Validated native list selectors required');
 return common.proofFromList(p,{...j,title:j.caption},{...j.nativeListSelectors,publicText:/所有人/,reviewText:/内容审查中/});
}
module.exports={...common,prepare,resumePreparation,preflight,submit,readback};
