'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright-core'),{uploadCover}=require('../lib/publishers/douyin-cover');
test('cover upload targets the visible editor instead of the main-page decoy and waits for saved thumbnail',{skip:!process.env.PROMO_TEST_BROWSER},async()=>{
 const b=await chromium.launch({executablePath:process.env.PROMO_TEST_BROWSER,headless:true,args:['--no-sandbox']});const dir=await fs.mkdtemp(path.join(os.tmpdir(),'douyin-cover-'));
 try{const p=await b.newPage();await p.setContent(`<input type="file" id="decoy" accept="image/png,image/jpeg,image/jpg"><div><img id="bound" src="about:blank"><div><div>竖封面3:4</div></div></div><section id="editor"><div>设置竖封面</div><div class="semi-upload"><input id="correct" class="semi-upload-hidden-input" type="file" onchange="window.coverCandidate=window.URL.createObjectURL(this.files[0])"><div>点击上传文件或拖拽文件到这里</div></div><button onclick="document.querySelector('#bound').src=window.coverCandidate;document.querySelector('#editor').hidden=true">完成</button></section>`);
  const data=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=400;const x=c.getContext('2d');x.fillStyle='#245ADF';x.fillRect(0,0,300,400);return c.toDataURL('image/png').split(',')[1];});const file=path.join(dir,'cover.png');await fs.writeFile(file,Buffer.from(data,'base64'));
  const result=await uploadCover(p,file,'vertical');assert.deepEqual(result,{width:300,height:400,complete:true});assert.equal(await p.locator('#decoy').evaluate(e=>e.files.length),0);assert.equal(await p.locator('#correct').evaluate(e=>e.files[0].name),'cover.png');
  await p.locator('#editor').evaluate(e=>{e.hidden=false;e.appendChild(e.querySelector('.semi-upload').cloneNode(true));});await assert.rejects(uploadCover(p,file,'vertical'),/Ambiguous native cover-editor/);
 }finally{await b.close();await fs.rm(dir,{recursive:true,force:true});}
});
