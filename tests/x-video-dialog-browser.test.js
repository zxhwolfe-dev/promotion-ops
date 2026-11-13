'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');const {setAIDisclosure}=require('../lib/publishers/x-video');
test('AI disclosure Done is scoped to the child dialog and preserves the outer video editor', {skip:!process.env.PROMO_TEST_BROWSER},async()=>{
 const b=await chromium.launch({executablePath:process.env.PROMO_TEST_BROWSER,headless:true,args:['--no-sandbox']});try{const p=await b.newPage();await p.setContent(`<div role="dialog" id="outer"><div contenteditable="true" data-testid="tweetTextarea_0">Review these six projects</div><button data-testid="contentDisclosureButton" onclick="document.querySelector('#child').hidden=false">Disclosure</button><button onclick="document.querySelector('#outer').remove()">Done</button><div role="dialog" id="child" hidden><h2>Content disclosure</h2><div><div><span>Made with AI</span></div><input type="checkbox"></div><button onclick="document.querySelector('#child').hidden=true">Done</button></div></div>`);await setAIDisclosure(p);assert.equal(await p.locator('[data-testid=tweetTextarea_0]').innerText(),'Review these six projects');assert.equal(await p.locator('#child input').isChecked(),true);assert.equal(await p.locator('#child').isVisible(),false);
 }finally{await b.close();}
});
