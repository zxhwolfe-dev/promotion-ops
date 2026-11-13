'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {assertNativeIdentity}=require('../lib/publishers/bilibili-video');
test('native UID and author establish Bilibili identity independently of old videos or list pagination',()=>{
 const account={nativeUid:'1808209999',publicAuthor:'momo不吃芹菜'},valid={code:0,data:{isLogin:true,mid:1808209999,uname:'momo不吃芹菜'}};assert.doesNotThrow(()=>assertNativeIdentity(valid,account));
 for(const bad of [{...valid,code:-101},{...valid,data:{...valid.data,isLogin:false}},{...valid,data:{...valid.data,mid:12345}},{...valid,data:{...valid.data,uname:'Other'}}])assert.throws(()=>assertNativeIdentity(bad,account),{code:'ACCOUNT_UNVERIFIED'});
 assert.throws(()=>assertNativeIdentity(valid,{publicAuthor:account.publicAuthor}),{code:'ACCOUNT_UNVERIFIED'});
});
