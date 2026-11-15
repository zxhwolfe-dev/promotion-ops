'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{checksReady,waitForNativeChecks}=require('../lib/publishers/tiktok-checks');
const good='音乐版权检查\n未发现问题。\n内容快速检查\n未发现问题。';
test('TikTok requires both actual native checks, not just the absence of an error',()=>{assert.equal(checksReady(good),true);for(const s of ['所有人 现在',good.replace('音乐版权检查\n未发现问题。','音乐版权检查 检查中'),good.replace('内容快速检查\n未发现问题。','内容快速检查 发现问题'),good+'继续发布？'])assert.equal(checksReady(s),false);});
test('TikTok preflight waits for checks and rejects a check result that changed after readiness',async()=>{let waited=false;await waitForNativeChecks({waitForFunction:async(fn,arg,o)=>{waited=true;assert.equal(o.timeout,120000);},locator:()=>({innerText:async()=>good})});assert.equal(waited,true);await assert.rejects(waitForNativeChecks({waitForFunction:async()=>{},locator:()=>({innerText:async()=>good+'继续发布？'})}),/not complete/);});
