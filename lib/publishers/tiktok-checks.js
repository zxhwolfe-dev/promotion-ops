'use strict';
function checksReady(text){return /音乐版权检查\s*未发现问题[。.]?/.test(text)&&/内容快速检查\s*未发现问题[。.]?/.test(text)&&!text.includes('继续发布？');}
async function waitForNativeChecks(p,{timeout=120000}={}){
 await p.waitForFunction(()=>{const text=document.body.innerText;return /音乐版权检查\s*未发现问题[。.]?/.test(text)&&/内容快速检查\s*未发现问题[。.]?/.test(text)&&!text.includes('继续发布？');},null,{timeout});
 if(!checksReady(await p.locator('body').innerText()))throw Error('Native copyright/content checks not complete; preserve original upload');
}
module.exports={checksReady,waitForNativeChecks};
