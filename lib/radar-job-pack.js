'use strict';
const path=require('node:path'),fs=require('node:fs/promises');
async function buildJobPack({data,qa,packageRoot,accounts,day,queueFile}){
 const jobs=[];for(const [channel,lang]of [['douyin','zh'],['bilibili','zh'],['tiktok','en'],['youtube','en'],['x','en']]){
  const v=qa.versions.find(x=>x.voice===(lang==='zh'?'zh-CN-XiaoxiaoNeural':'en-US-AriaNeural'));if(!v)throw Error('Missing language quality version');
  const url=(lang==='zh'?'https://aiworkstation.cn':'https://useaistation.com')+'/githubai/?utm_source='+channel+'&utm_medium=video&utm_campaign=radar_daily_'+day.replaceAll('-','');
  const title=lang==='zh'?data.titles.zh:data.titles.en;
  const caption=lang==='zh'?`${title}\n${day}雷达${data.rankingLabel || '日趋势榜'}精选，保留原始名次，不是榜单前六名。项目资料介绍，未逐项安装实测；使用前核对兼容环境、权限、许可和模型成本。声音素材需获授权。\n完整项目卡与来源：${url}\nAI辅助整理；微软合成旁白。`:`${title}\nSix native Radar ${data.ranking || 'daily'} picks, ${day}; original ranks, not the top six. Source-based profiles, not hands-on tests. Check compatibility, permissions, licenses and model costs; obtain consent for voice material. I build Radar. Microsoft synthetic narration.\n${url}`;
  const shortX=`Six Radar picks for different tasks, ${day}. Original project cards, not hands-on tests. Check setup, permissions and licenses. I build Radar. AI-assisted; synthetic voice.\n${url}`;
  const job={version:1,queueFile,channel,account:accounts[channel]||null,episodeId:'ep'+data.episode+'-radar-daily',publicationDate:day,sourceDate:day,title,caption:channel==='x'?shortX:caption,videoPath:v.videoPath,sha256:v.sha256,qualityReport:path.join(packageRoot,lang,'quality-report.json'),tags:lang==='zh'?['人工智能','开源项目','AI工具']:[],liveAdapterApproved:false,expectedDurationSeconds:v.seconds};
  // Covers and native account/selectors must be configured and checked; never infer eligibility.
  const config=accounts[channel]||{};job.coverPath=path.join(packageRoot,lang,'cover-safe-4x3.png');job.verticalCoverPath=path.join(packageRoot,lang,'cover-safe-3x4.png');if(config.nativeListSelectors)job.nativeListSelectors=config.nativeListSelectors;
  jobs.push(job);
 }
 await fs.writeFile(path.join(packageRoot,'publish-jobs.json'),JSON.stringify(jobs,null,2)+'\n');return jobs;
}
module.exports={buildJobPack};
