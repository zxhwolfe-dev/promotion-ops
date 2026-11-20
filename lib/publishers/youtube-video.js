'use strict';
const common=require('./native-video-common');
const title=p=>p.getByRole('textbox',{name:'添加一个可描述你视频的标题（输入 @ 可提及某个频道）',exact:true});
const description=p=>p.getByRole('textbox',{name:'向观看者介绍你的视频（输入 @ 可提及频道）',exact:true});
async function prepare(p,j){
 if(await p.locator('ytcp-uploads-dialog').getByRole('dialog').isVisible().catch(()=>false))throw Error('Existing upload preserved');
 let stage;
 try {
  stage = '打开创建菜单';
  await (await common.uniqueButton(p,'创建')).click();
  stage = '选择上传视频';
  await p.getByRole('menuitem',{name:'上传视频',exact:true}).click();
  stage = '选择视频文件';
  await p.locator('input[type=file]').setInputFiles(j.videoPath);

  stage = '等待上传完成并填写标题说明';
  await title(p).waitFor({timeout:60000});await p.locator('ytcp-uploads-dialog').getByText(/上传完毕/).waitFor({timeout:120000});await title(p).fill(j.title);await title(p).press('Tab');await description(p).fill(j.caption);await description(p).press('Tab');

  stage = '设置受众';
  await p.getByRole('radio',{name:'不，内容不是面向儿童的',exact:true}).check();
  stage = '打开高级设置';
  await (await common.uniqueButton(p,'显示高级设置')).click();

  stage = '设置作品声明';
  for(const name of ['否，我的视频不包含付费宣传内容','是，使用了 AI']){const r=p.getByRole('radio',{name,exact:true});await r.check();if(!await r.isChecked())throw Error('Native disclosure did not persist');}

  stage = '复核标题和说明';
  await common.assertText(title(p),j.title);await common.assertText(description(p),j.caption);

  stage = '进入公开设置';
  for(let i=0;i<3;i++)await (await common.uniqueButton(p,'继续')).click();

  stage = '设置公开可见';
  await p.getByRole('radio',{name:'公开',exact:true}).check();

  stage = '等待平台检查';
  await p.locator('ytcp-uploads-dialog').getByText('检查完毕。未发现任何问题。',{exact:true}).waitFor({timeout:600000});
 } catch (error) {
  error.message = 'YouTube准备阶段（'+stage+'）：'+error.message;
  throw error;
 }
}
async function preflight(p,j){const dialog=p.locator('ytcp-uploads-dialog');const body=await dialog.innerText();if(!body.includes(j.title)||!body.includes('检查完毕。未发现任何问题。')||!await p.getByRole('radio',{name:'公开',exact:true}).isChecked())throw Error('YouTube final check/public setting incomplete');}
async function submit(p,j){const dialog=p.locator('ytcp-uploads-dialog').getByRole('dialog');await dialog.waitFor({state:'visible',timeout:20000});await (await common.uniqueButton(dialog,'发布')).click();const success=p.getByRole('dialog').filter({hasText:'视频发布时间'}).filter({hasText:j.title});await success.waitFor({state:'visible',timeout:60000});const text=await success.innerText();if(!text.includes('发布于')||!text.includes('youtube.com/shorts/'))throw Error('Native publication confirmation incomplete');const receipt={nativeConfirmation:true,observedAt:new Date().toISOString(),text};const close=success.locator('button').filter({hasText:/^关闭$/});if(await close.count()!==1)throw Error('Native confirmation close button ambiguous');await close.click();return receipt;}
async function readback(p,j){
 return common.proofFromList(p,j,{rowSelector:'ytcp-video-row',titleSelector:'#video-title',urlSelector:'a[href*="/video/"]',mediaSelector:'a[href*="/video/"]',publicText:/(?:^|\n)公开(?:\n|$)/,reviewText:/正在处理|检查中/}).then(x=>{if(x.url&&/studio\.youtube\.com\/video\/[^/]+\/edit/.test(x.url))x.url='https://www.youtube.com/shorts/'+new URL(x.url).pathname.split('/')[2];return x;});
}
module.exports={...common,prepare,preflight,submit,readback};
