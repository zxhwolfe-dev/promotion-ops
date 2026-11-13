'use strict';
const common=require('./native-video-common');
async function setAIDisclosure(p){
 const editor=p.locator('[data-testid=tweetTextarea_0]');await editor.waitFor();const before=await editor.innerText();
 await p.locator('[data-testid=contentDisclosureButton]').click();
 const heading=p.getByText('Content disclosure',{exact:true}).filter({visible:true});await heading.waitFor();
 if(await heading.count()!==1)throw Error('Ambiguous content disclosure heading');
 const dialog=heading.locator('xpath=ancestor::*[@role="dialog"][1]');if(await dialog.count()!==1)throw Error('Native disclosure is not in a unique child dialog');
 const row=dialog.getByText('Made with AI',{exact:true}).locator('xpath=../..');const toggle=row.locator('input[type=checkbox]');await toggle.check();if(!await toggle.isChecked())throw Error('AI toggle failed');
 // No Enter/global keyboard event: Done must be contained in the child dialog.
 await (await common.uniqueButton(dialog,'Done')).click();await editor.waitFor();if(await editor.innerText()!==before)throw Error('Outer editor lost or changed after disclosure');
}
async function prepare(p,j){
 await p.goto(j.account.listURL,{waitUntil:'domcontentloaded'});await p.locator('[data-testid=SideNav_NewTweet_Button]').click();const ed=p.locator('[data-testid=tweetTextarea_0]');await ed.waitFor();if((await ed.innerText()).trim())throw Error('Preserve nonempty X draft');
 await ed.click();for(const [i,line]of j.caption.split('\n').entries()){if(i)await ed.press('Enter');if(line)await p.keyboard.insertText(line);}
 await p.locator('input[data-testid=fileInput]').setInputFiles(j.videoPath);await p.getByText(/\.mp4: Ready/).waitFor({timeout:120000});await setAIDisclosure(p);
}
async function preflight(p,j){await common.assertText(p.locator('[data-testid=tweetTextarea_0]'),j.caption);const dialog=p.locator('[role=dialog]').last();const text=await dialog.innerText();if(!text.includes('Made with AI')||!text.includes(': Ready')||!await p.locator('[data-testid=tweetButton]').isEnabled())throw Error('X media/disclosure not ready');}
async function submit(p){await p.locator('[data-testid=tweetTextarea_0]').press('Control+Enter');await p.getByText('Your post was sent',{exact:false}).waitFor({timeout:60000});}
async function readback(p,j){
 await p.goto(j.account.listURL,{waitUntil:'domcontentloaded'});await p.locator('article').first().waitFor({timeout:30000});const core=j.caption.split(/https:\/\//)[0].trim();const rows=p.locator('article').filter({hasText:core});
 if(await rows.count()!==1)return {state:'unknown',observedAt:new Date().toISOString()};const row=rows.first(),href=await row.locator('a:has(time)').first().getAttribute('href');
 const owner=new URL(j.account.listURL).pathname.replace(/\/$/,'');if(!href?.startsWith(owner+'/status/')||!/^\/[^/]+\/status\/\d+$/.test(href))return {state:'unknown',observedAt:new Date().toISOString()};
 // A freshly mounted video may not yet have loaded its metadata. Read the same post only.
 await p.waitForFunction(({core,expected})=>[...document.querySelectorAll('article')].some(a=>a.innerText.includes(core)&&[...a.querySelectorAll('video')].some(v=>Number.isFinite(v.duration)&&Math.abs(v.duration-expected)<2)),{core,expected:j.expectedDurationSeconds},{timeout:20000}).catch(()=>{});
 const media=await row.locator('video').evaluateAll(es=>es.map(e=>e.duration));return {state:'published',url:'https://x.com'+href,identityVerified:true,contentVerified:true,mediaVerified:media.some(n=>Math.abs(n-j.expectedDurationSeconds)<2),observedAt:new Date().toISOString(),nativeText:await row.innerText()};
}
module.exports={...common,prepare,preflight,submit,readback,setAIDisclosure};
