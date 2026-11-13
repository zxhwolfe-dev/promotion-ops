'use strict';
// Separate local creation and per-adapter validated publication timers.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile);
async function install({configFile,mode='build',unitRoot=path.join(os.homedir(),'.config/systemd/user'),activate=false}){
 if(!['plan','build','publish'].includes(mode))throw Error('Unsupported timer mode');
 if(/[\r\n\0]/.test(configFile))throw Error('Invalid config path');
 const config=JSON.parse(await fs.readFile(configFile,'utf8'));if(!config.anonymousBrowser||!config.videoPython)throw Error('Fixed runtime/browser config required');
 const publishing=mode==='publish',validated=[];
 if(publishing){if(config.activation?.publishEnabled!==true)throw Error('Publishing timer requires explicit activation and completed native validation');for(const channel of Object.keys(config.activation.liveValidatedAdapters||{})){if((await require('../../lib/native-adapter-validation').validateNativeAdapter(channel,config)).valid)validated.push(channel);}if(!validated.length)throw Error('Publishing timer requires at least one current native-validated adapter');}
 const cmd=path.resolve(__dirname,'daily-run.js');const quote=x=>'"'+x.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('%','%%')+'"';
 await fs.mkdir(unitRoot,{recursive:true});const service='[Unit]\nDescription=Local Radar daily creation (no platform publishing)\n\n[Service]\nType=oneshot\nEnvironment="PROMO_STATE_DIR='+path.join(os.homedir(),'.promotion-ops')+'"\nEnvironment="PROMO_TEST_BROWSER='+config.anonymousBrowser+'"\nExecStart='+[process.execPath,cmd,'--config',path.resolve(configFile),'--mode',mode].map(quote).join(' ')+'\nTimeoutStartSec=2400\n';
 const unit=publishing?'promotion-radar-publish':'promotion-radar-build';const time=publishing?'18:45:00':'18:00:00';
 const timer='[Unit]\nDescription='+(publishing?'Local Radar publish daily Shanghai':'Create current Radar package daily at 18:00 Shanghai')+'\n\n[Timer]\nOnCalendar=*-*-* '+time+' Asia/Shanghai\nPersistent=false\nUnit='+unit+'.service\n\n[Install]\nWantedBy=timers.target\n';
 for(const [name,body]of [[unit+'.service',service.replace('Local Radar daily creation (no platform publishing)',publishing?'Local Radar publication (native-validated adapters only)':'Local Radar daily creation (no platform publishing)')],[unit+'.timer',timer]]){
 const dest=path.join(unitRoot,name);const old=await fs.readFile(dest,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return null;});if(old&&old!==body)throw Error('Existing different timer preserved; inspect before replacement');await fs.writeFile(dest,body,{mode:0o600});
 }
 if(activate){await execute('systemctl',['--user','daemon-reload']);await execute('systemctl',['--user','enable','--now',unit+'.timer']);}
 return {installed:true,activated:activate,mode,platformPublishingEnabled:publishing,validatedChannels:validated,unitRoot,catchUpOnBoot:false};
}
if(require.main===module){const a=process.argv.slice(2),i=a.indexOf('--config');if(i<0)throw Error('--config file required');install({configFile:a[i+1],mode:a.includes('--publish')?'publish':a.includes('--plan-only')?'plan':'build',activate:a.includes('--activate')}).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});}module.exports={install};
