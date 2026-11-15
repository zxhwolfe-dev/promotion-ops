'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright-core');
test('YouTube waits for native success instead of a zero-height wrapper or a dialog that stays open behind confirmation',{skip:!process.env.PROMO_TEST_BROWSER},async()=>{
 const b=await chromium.launch({executablePath:process.env.PROMO_TEST_BROWSER,headless:true,args:['--no-sandbox']});
 try{const p=await b.newPage();await p.setContent('<ytcp-uploads-dialog style="display:block;height:0"><div role="dialog" style="position:fixed;top:10px;background:white"><button id="publish">发布</button></div></ytcp-uploads-dialog>');
 await p.evaluate(()=>{document.querySelector('#publish').onclick=()=>setTimeout(()=>{window.saved=true;const d=document.createElement('div');d.role='dialog';d.style='position:fixed;top:100px;background:white';d.textContent='视频发布时间 Test video 发布于 today youtube.com/shorts/original';const b=document.createElement('button');b.textContent='关闭';b.onclick=()=>d.remove();d.append(b);document.body.append(d);},250);});
 assert.equal(await p.locator('ytcp-uploads-dialog').isVisible(),false);const r=await require('../lib/publishers/youtube-video').submit(p,{title:'Test video'});assert.equal(await p.evaluate(()=>window.saved),true);assert.equal(r.nativeConfirmation,true);assert.equal(await p.getByRole('dialog').count(),1);
 }finally{await b.close();}
});
