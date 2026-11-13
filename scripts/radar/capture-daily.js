'use strict';
// Anonymous public Radar data/screenshots only; no login CDP, model endpoint or publisher.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('playwright-core');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const shanghai=t=>new Date(Date.parse(t)+8*3600000).toISOString().slice(0,10);
function sourceSentence(text,lang){
 const sentence=(text.match(lang==='zh'?/[^。！？]+[。！？]/:/^.+?[.!?](?=\s|$)/s)||[])[0]?.trim();
 if(!sentence||sentence.length>(lang==='zh'?140:310)||sentence.length<(lang==='zh'?12:30))return null;
 return sentence;
}
async function captureDaily({date,episode,output,historyFile,executable,ranking='daily'}){
 if(!executable||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(episode)||episode<1)throw Error('Explicit date, positive episode and isolated browser executable required');
 const history=JSON.parse(await fs.readFile(historyFile,'utf8'));const seen=new Set(history.flatMap(x=>x.projectIds||[]));
 await fs.mkdir(output,{recursive:true});if(await fs.stat(path.join(output,'episode-input.json')).then(()=>true,()=>false))throw Error('Existing episode input preserved; inspect and reuse it');
 const b=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});const records={},snapshots={};
 try{const p=await b.newPage({viewport:{width:1280,height:2000},deviceScaleFactor:2});
 for(const lang of ['zh','en']){
  const origin=lang==='zh'?'https://aiworkstation.cn':'https://useaistation.com';await p.goto(origin+'/githubai/rankings/'+encodeURIComponent(ranking)+'/?lang='+lang,{waitUntil:'domcontentloaded',timeout:45000});
  await p.locator('.project-card[data-project-id]').first().waitFor({timeout:30000});await p.evaluate(()=>document.fonts.ready);
  const release=await p.locator('body').getAttribute('data-githubai-content-release');if(!release)throw Error('No native public release binding');
  const response=await p.request.get(origin+'/api/v1/ai/githubai/overview?lang='+lang+'&content_release='+encodeURIComponent(release));if(!response.ok())throw Error('Public overview unavailable');const payload=await response.json();const overview=payload.data||payload;
  if(!overview.rankings_updated_at||shanghai(overview.rankings_updated_at)!==date)throw Error('Ranking release is not current requested day; do not relabel an old ranking');
  if(!overview.rankings?.some(x=>x.id===ranking))throw Error('Unrecognized native ranking');snapshots[lang]={release,releasedAt:overview.rankings_updated_at};
  const cards=p.locator('.project-card[data-project-id]');records[lang]=[];
  for(let i=0;i<await cards.count();i++){
   const card=cards.nth(i),id=await card.getAttribute('data-project-id');if(seen.has(id))continue;
   if(/stock|trading|股票|证券|选股|收益承诺/i.test(id+' '+await card.innerText()))continue;
   const name=(await card.locator('.project-title').innerText()).trim(),summary=await card.locator('.project-summary').innerText();const sentence=sourceSentence(summary,lang);if(!sentence)continue;
   const short=name.split('/').at(-1);if(short.length>30)continue;
   await card.scrollIntoViewIfNeeded();await card.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode().catch(()=>{}))));const file=path.join(output,id+'-'+lang+'.png');await card.screenshot({path:file});
   const source={id,lang,rank:i+1,url:p.url(),file,capturedAt:new Date().toISOString(),releasedAt:overview.rankings_updated_at,release,sha256:hash(await fs.readFile(file)),text:await card.innerText(),nativeScreenshot:true,alteredDOM:false};
   const narration=lang==='zh'?`第${i+1}名，${short}。${sentence}`:`At rank ${i+1}, ${short}. ${sentence}`;
   records[lang].push({id,headline:short,narration,source});
  }
 }
 if(snapshots.zh.release!==snapshots.en.release)throw Error('Bilingual native releases differ');
 const selected=records.zh.filter(z=>records.en.some(e=>e.id===z.id)).slice(0,6);if(selected.length<6)throw Error('Fewer than six new bilingual eligible projects; do not pad or repost');
 const data={episode,publicationDate:date,sourceDate:date,ranking,titles:{zh:date.slice(5).replace('-','/')+'｜6个AI项目，按任务看用途与条件',en:date+' | 6 AI projects: uses and setup conditions'},projects:selected.map(z=>({id:z.id,zh:z,en:records.en.find(e=>e.id===z.id)})),rankingLabel:ranking==='daily'?'日趋势榜':ranking==='newcomer'?'新项目热榜':ranking,claimBoundary:'Source-based native Radar profiles, not installations or performance tests. Rankings are not daily star-growth order.'};
 await fs.writeFile(path.join(output,'episode-input.json'),JSON.stringify(data,null,2)+'\n');await fs.writeFile(path.join(output,'capture-provenance.json'),JSON.stringify({snapshots,seenProjects:seen.size,selectedIds:selected.map(x=>x.id),serverModelExecution:false,authenticatedBrowser:false},null,2));return data;
 }finally{await b.close();}
}
if(require.main===module){const args=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,all)=>i%2===0?[...a,[x.replace(/^--/,''),all[i+1]]]:a,[]));captureDaily({date:args.date,episode:Number(args.episode),output:path.resolve(args.output),historyFile:path.resolve(args.history),executable:process.env.PROMO_TEST_BROWSER,ranking:args.ranking||'daily'}).then(x=>console.log(JSON.stringify({status:'captured_requires_content_quality_review',projects:x.projects.map(x=>x.id)}))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={captureDaily,sourceSentence};
