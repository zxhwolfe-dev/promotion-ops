'use strict';
const {insertEditorText}=require('../editor-text');
const norm=s=>s.replace(/[\s\u200B-\u200F\uFEFF]/g,'');
async function editor(p,channel){
 if(channel==='weibo')return p.getByPlaceholder('有什么新鲜事想分享给大家？');
 if(channel==='toutiao')return p.locator('.ProseMirror[contenteditable=true]');
 for(const f of p.frames())if(await f.locator('body.ks-editor').count())return f.locator('body.ks-editor');
 throw Error('Native Taoguba editor missing');
}
async function prepare(p,j){
 await p.goto(j.account.composeURL,{waitUntil:'domcontentloaded'});const ed=await editor(p,j.channel);await ed.waitFor();
 const before=j.channel==='weibo'?await ed.inputValue():await ed.innerText();if(before.trim()&&before.trim()!=='有什么新鲜事想告诉大家？')throw Error('Existing draft preserved');
 const media=j.reports.map(x=>({name:require('node:path').basename(x.path),mimeType:'image/png',buffer:require('node:fs').readFileSync(x.path)}));
 if(j.channel==='weibo'){
  await ed.fill(j.caption);await p.locator('input[type=file]').setInputFiles(media);await p.locator('[class*="_picbed_"] img').nth(2).waitFor({timeout:60000});await p.getByText('内容声明',{exact:true}).locator('..').click();await p.getByRole('button',{name:'内容由AI生成',exact:true}).click();
 }else if(j.channel==='toutiao'){
  await ed.fill(j.caption);await p.getByRole('button',{name:'图片',exact:true}).click();const upload=p.locator('input[type=file]:not(#upload-drag-input)');if(await upload.count()!==1)throw Error('Ambiguous image input');await upload.setInputFiles(media);await p.getByText('共 3 张',{exact:false}).waitFor({timeout:60000});await p.getByRole('button',{name:'确定',exact:true}).click();
  const ai=p.getByText('引用AI',{exact:true}).locator('xpath=ancestor::label[1]');if(!await ai.locator('input').isChecked())await ai.click();const first=p.getByText('头条首发',{exact:true}).locator('xpath=ancestor::label[1]');if(await first.locator('input').isChecked())await first.click();
  const music=p.getByText('开启后可在小视频场景分发，获得更多曝光',{exact:true});if(await music.count()){const label=music.locator('xpath=ancestor::label[1]');if(await label.locator('input').isChecked())await label.click();}
 }else{
  if((await p.locator('#subject').inputValue()).trim())throw Error('Existing subject preserved');await p.locator('#subject').fill(j.caption.split('\n')[0]);await insertEditorText(p,ed,j.caption);await p.getByText('复盘',{exact:true}).click();
  for(const file of media){await ed.click();await ed.press('Control+End');await ed.press('Enter');await p.locator('#uploadImg').click();await p.locator('#fileInput').setInputFiles(file);await p.locator('#imageList img').waitFor();await p.locator('#uploadBtn').click();}
 }
}
async function preflight(p,j){
 const ed=await editor(p,j.channel),text=j.channel==='weibo'?await ed.inputValue():await ed.innerText();if(norm(text)!==norm(j.caption))throw Error('Native caption differs');if(/https?:|utm_source|akaiagents\.com/i.test(text))throw Error('AK caption must not include product links');
 if(j.channel==='weibo'){if(await p.locator('[class*="_picbed_"] img').count()!==3||!(await p.locator('body').innerText()).includes('内容由AI生成'))throw Error('Three images/AI declaration missing');}
 if(j.channel==='toutiao'){if(!(await p.locator('body').innerText()).includes('共 3 张')||!await p.getByText('引用AI',{exact:true}).locator('xpath=ancestor::label[1]').locator('input').isChecked())throw Error('Three images/AI declaration missing');}
 if(j.channel==='taoguba'&&!await ed.locator('img').evaluateAll(es=>es.length===3&&es.every(e=>e.complete&&e.naturalWidth>=400&&e.naturalHeight>=400&&/^https:\/\//.test(e.currentSrc))))throw Error('Three Taoguba images not decoded');
}
async function submit(p,j){if(j.channel==='weibo')await p.getByRole('button',{name:'发送',exact:true}).click();else if(j.channel==='toutiao')await p.getByRole('button',{name:'发布',exact:true}).click();else await p.locator('#submit1').click();}
module.exports={prepare,preflight,submit};
