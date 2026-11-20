'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {isCoverOnlyAmendment}=require('../lib/editorial-cover-amendment');
test('approved cover amendment cannot change video, copy, episode or a refused decision',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cover-amend-'));
 try{const old={channel:'douyin',episodeId:'ep21',videoPath:'/same.mp4',title:'same',caption:'same',coverPath:'/old.png'},file=path.join(root,'job.json'),raw=JSON.stringify(old);await fs.writeFile(file,raw);const previous={decision:'approve',files:[{file,sha256:require('node:crypto').createHash('sha256').update(raw).digest('hex')}]},changed={...old,coverPath:'/new.png'};
 assert.equal(await isCoverOnlyAmendment(previous,[changed]),true);
 for(const key of ['videoPath','title','caption','episodeId'])assert.equal(await isCoverOnlyAmendment(previous,[{...changed,[key]:'different'}]),false);
 assert.equal(await isCoverOnlyAmendment({...previous,decision:'revise'},[changed]),false);
 assert.equal(await isCoverOnlyAmendment(previous,[old]),false);
 await fs.writeFile(file,JSON.stringify({...old,title:'tampered'}));assert.equal(await isCoverOnlyAmendment(previous,[{...changed,title:'tampered'}]),false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
