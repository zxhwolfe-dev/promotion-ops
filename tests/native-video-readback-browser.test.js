'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');const {proofFromList}=require('../lib/publishers/native-video-common');
test('private/draft rows and absent native permalinks return unknown without waiting for nonexistent links',{skip:!process.env.PROMO_TEST_BROWSER},async()=>{
 const b=await chromium.launch({executablePath:process.env.PROMO_TEST_BROWSER,headless:true,args:['--no-sandbox']});
 try{const p=await b.newPage();p.setDefaultTimeout(1000);let privacy='草稿',href='';await p.route('https://studio.youtube.com/test',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<div class="row"><a class="title" ${href}>Six projects</a><div>1:13</div><div>${privacy}</div></div>`}));
 const job={title:'Six projects',channel:'youtube',account:{listURL:'https://studio.youtube.com/test'},expectedDurationSeconds:72.9};
 const selectors={rowSelector:'.row',titleSelector:'.title',urlSelector:'a[href]',mediaSelector:'a[href]',publicText:/公开/,reviewText:/审核中/};
 let proof=await proofFromList(p,job,selectors);assert.equal(proof.state,'unknown');assert.equal(proof.reason,'native_row_not_public');
 privacy='公开';proof=await proofFromList(p,job,selectors);assert.equal(proof.state,'unknown');assert.equal(proof.reason,'native_permalink_absent');
 privacy='审核中';href='href="/video/existing123/edit"';proof=await proofFromList(p,job,selectors);assert.equal(proof.state,'pending_review');assert.equal(proof.url,'https://studio.youtube.com/video/existing123/edit');assert.equal(proof.mediaVerified,true);
 }finally{await b.close();}
});
