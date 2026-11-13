'use strict';
// The short-accept input outside the editor edits an unrelated image. Only the
// visible cover editor's drag uploader binds its canvas to the final cover.
const {uniqueButton}=require('./native-video-common');
const labels={vertical:['竖封面3:4','设置竖封面',3/4],horizontal:['横封面4:3','设置横封面',4/3]};
async function uploadCover(p,file,kind){
 const spec=labels[kind];if(!spec)throw Error('Unknown cover orientation');
 const [label,heading,ratio]=spec,card=p.getByText(label,{exact:true}).locator('../..');
 const before=await card.locator('img').count()?await card.locator('img').first().getAttribute('src'):null;
 const editorHeading=p.getByText(heading,{exact:true}).locator('xpath=self::*[not(ancestor-or-self::button)]');
 if(!await editorHeading.isVisible().catch(()=>false)){
  const upsell=p.getByRole('button',{name:heading,exact:true}).filter({visible:true});
  if(await upsell.count()===1)await upsell.click();else{await card.hover();const edit=card.getByText('编辑封面',{exact:true});
   if(await edit.isVisible().catch(()=>false))await edit.click();else await card.getByText('选择封面',{exact:true}).click();}
 }
 await editorHeading.waitFor({timeout:20000});
 const area=p.locator('.semi-upload').filter({hasText:'点击上传文件或拖拽文件到这里'}).filter({visible:true});
 if(await area.count()!==1)throw Error('Ambiguous native cover-editor upload area');
 const input=area.locator('input[type=file].semi-upload-hidden-input');
 if(await input.count()!==1)throw Error('Ambiguous cover input; preserve editor');
 await input.setInputFiles(file);await p.waitForLoadState('networkidle',{timeout:30000});
 await (await uniqueButton(p,'完成')).click();await editorHeading.waitFor({state:'hidden',timeout:30000});
 await p.waitForFunction(({label,before,ratio})=>{
  const text=[...document.querySelectorAll('div')].find(e=>e.textContent===label&&e.children.length===0);
  const image=text?.parentElement?.parentElement?.querySelector('img');
  return image?.complete&&image.naturalWidth>0&&image.getAttribute('src')!==before&&Math.abs(image.naturalWidth/image.naturalHeight-ratio)<.02;
 },{label,before,ratio},{timeout:30000});
 const image=card.locator('img');return image.evaluate(e=>({width:e.naturalWidth,height:e.naturalHeight,complete:e.complete}));
}
module.exports={uploadCover};
