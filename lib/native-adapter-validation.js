'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const accountSHA=account=>crypto.createHash('sha256').update(JSON.stringify(account)).digest('hex');
async function implementationSHA(channel){
 if(!['douyin','bilibili','tiktok','youtube','x'].includes(channel))throw Error('Unsupported video adapter');
 const names=['video-job.js','native-video-common.js','public-original.js',channel+'-video.js'];
 if(channel==='douyin')names.push('douyin-cover.js');
 const hash=crypto.createHash('sha256');for(const name of names){hash.update(name);hash.update(await fs.readFile(path.join(__dirname,'publishers',name)));}return hash.digest('hex');
}
async function validateNativeAdapter(channel,config){
 const record=config.activation?.validations?.[channel];
 if(config.activation?.liveValidatedAdapters?.[channel]!==true||!record?.evidence)return {valid:false,reason:'native_validation_missing'};
 try{
  const bytes=await fs.readFile(record.evidence);if(crypto.createHash('sha256').update(bytes).digest('hex')!==record.evidenceSHA256)throw Error('validation evidence changed');
  const rec=JSON.parse(bytes),proof=rec.proof;
  if(record.accountConfigSHA256!==accountSHA(config.accounts?.[channel]))throw Error('account/selectors configuration changed; native validation required');
  if(rec.channel!==channel||rec.job?.account?.id!==config.accounts?.[channel]?.id||!['published_native_verified','published_native_verified_external_unknown'].includes(rec.status)||proof?.state!=='published'||!proof.identityVerified||!proof.contentVerified||!proof.mediaVerified||!proof.url||!proof.observedAt)throw Error('incomplete native publication validation');
  if(await implementationSHA(channel)!==record.implementationSHA256)throw Error('adapter implementation changed; native validation required');
  return {valid:true,externalPublicVerified:proof.publicProbe?.verified===true,evidence:record.evidence};
 }catch(e){return {valid:false,reason:e.message};}
}
module.exports={implementationSHA,validateNativeAdapter,accountSHA};
