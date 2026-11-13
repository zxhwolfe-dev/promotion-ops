'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright-core');const {assertAccount}=require('../lib/publishers/native-video-common');
test('native profile menu proves the account without relying on an old post or navigating away from its editor',{skip:!process.env.PROMO_TEST_BROWSER},async()=>{
 const b=await chromium.launch({executablePath:process.env.PROMO_TEST_BROWSER,headless:true,args:['--no-sandbox']});try{const p=await b.newPage();await p.setContent(`<textarea id="editor">Six reviewed native project cards</textarea><button id="profile" onclick="document.querySelector('#menu').hidden=!document.querySelector('#menu').hidden">Account</button><div id="menu" hidden><a href="https://www.tiktok.com/@useaistation">主页</a></div>`);
 await assertAccount(p,{channel:'tiktok',account:{id:'useaistation',ownerSelector:'a[href="https://www.tiktok.com/@useaistation"]',ownerText:'主页',ownerRevealSelector:'#profile'}});assert.equal(await p.locator('#menu').isVisible(),false);assert.equal(await p.locator('#editor').inputValue(),'Six reviewed native project cards');assert.equal(p.context().pages().length,1);
 }finally{await b.close();}
});
