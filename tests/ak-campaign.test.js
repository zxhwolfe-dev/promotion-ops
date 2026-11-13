'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {campaignURL,copyIssues,assertPromotionLinks}=require('../lib/campaign');
const linkCLI=require('../scripts/campaign/link');
const config={product:'ak',language:'en',path:'/',channel:'reddit',campaign:'20261014_ak_intro',content:'fintech_selfpromo',medium:'community'};
test('AK links keep the product domain for Chinese and English copy',async()=>{
 for(const language of ['zh','en']){
  const url=campaignURL({...config,language});
  assert.equal(new URL(url).origin,'https://akaiagents.com');
  assertPromotionLinks(url,'reddit',language,'ak');
 }
 const result=await linkCLI(['en','reddit','/','20261014_ak_intro','fintech_selfpromo','community','ak']);
 assert.equal(result.url,campaignURL(config));
 assert.equal(new URL(campaignURL({...config,product:'aiworkstation'})).origin,'https://useaistation.com');
});
test('AK public links reject missing tracking, duplicates, credentials and wrong product',()=>{
 const url=campaignURL(config);
 assert.ok(copyIssues({channel:'reddit',language:'en',text:url}).some(x=>x.code==='LANGUAGE_DOMAIN'));
 for(const link of ['akaiagents.com','https://akaiagents.com/?token=private',url+'&utm_source=reddit',url.replace('utm_source=reddit','utm_source=csdn')]){
  assert.ok(copyIssues({product:'ak',channel:'reddit',language:'en',text:link}).length);
 }
 for(const key of ['invite_code','session_id','email','token','sessionid','accessToken','id_token','refresh_token','clientId']){
  assert.throws(()=>campaignURL({...config,path:'/?'+key+'=private'}),{code:'PRIVATE_LINK'});
  assert.ok(copyIssues({product:'ak',channel:'reddit',language:'en',text:url+'&'+key+'=private'}).some(x=>x.code==='LINK_CREDENTIALS'));
 }
 for(const text of [url.replace('https://','http://'),url.replace('akaiagents.com','www.akaiagents.com')]){
  assert.ok(copyIssues({product:'ak',channel:'reddit',language:'en',text}).some(x=>x.code==='LANGUAGE_DOMAIN'));
 }
 assert.throws(()=>campaignURL({...config,product:'unknown'}),{code:'INVALID_PRODUCT'});
 assert.ok(copyIssues({product:'unknown',channel:'reddit',language:'en',text:url}).some(x=>x.code==='INVALID_PRODUCT'));
 assert.deepEqual(copyIssues({product:'ak',channel:'reddit',language:'en',text:'https://akaiagents.com.example.test/article'}),[]);
});
