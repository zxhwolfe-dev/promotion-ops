from pathlib import Path
from PIL import Image
import json,hashlib,re,wave,subprocess,sys
import cv2,numpy as np
R=Path(__file__).resolve().parents[1];episodes=json.loads((R/'episodes.json').read_text());episodes=episodes[:int(sys.argv[1])] if len(sys.argv)>1 else episodes;reports=[];all_sources=json.loads((R/'references/cards/capture-manifest.json').read_text())
for ep in episodes:
 assert len(ep['projectIds'])==6 and len(set(ep['projectIds']))==6
 for lang in ['zh','en']:
  out=R/'episodes'/ep['id']/lang;m=json.loads((out/'content_manifest.json').read_text());s=json.loads((out/'sync_report.json').read_text());video=Path(s['video_path']);cap=cv2.VideoCapture(str(video));assert cap.isOpened();assert int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))==1080 and int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))==1920;assert abs(cap.get(cv2.CAP_PROP_FPS)-30)<.01
  assert m['project_ids']==ep['projectIds'];assert [c['project_id'] for c in m['cards'] if c['kind']=='point']==ep['projectIds'];assert s['voice']==('zh-CN-XiaoxiaoNeural' if lang=='zh' else 'en-US-AriaNeural');assert s['provider']=='Microsoft free Edge Neural' and not s['paidTTS'];assert s['cashCNY']==0
  errors=[];audio=[]
  for i,t in enumerate(s['timeline']):
   original=cv2.imread(t['card']);decoded=[]
   for pos in [.24,.5,.76]:
    ts=t['start_sec']+t['duration_sec']*pos;cap.set(cv2.CAP_PROP_POS_MSEC,ts*1000);ok,frame=cap.read();assert ok
    # Captions below 1480 may change; the entire upper frame must remain fixed.
    mae=float(np.abs(frame[:1450].astype(np.int16)-original[:1450].astype(np.int16)).mean());assert mae<3.2,(ep['id'],lang,i,ts,mae);decoded.append(frame[:1450]);errors.append(mae)
   motion=float(np.abs(decoded[0].astype(np.int16)-decoded[-1].astype(np.int16)).mean());assert motion<1.5,(ep['id'],lang,'motion',i,motion)
   with wave.open(t['voice_path'],'rb') as f:data=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(np.float64)
   rms=float(np.sqrt(np.mean(data*data)));assert rms>150 and np.count_nonzero(np.abs(data)>500)>100;audio.append({'segment':i,'rms':round(rms,1),'peak':int(np.max(np.abs(data)))})
  cap.release();events=json.loads((out/'caption-timings.json').read_text());last=max(x['end'] for x in events);assert s['video_duration_sec']-last>=.78
  assert s['video_sha256']==hashlib.sha256(video.read_bytes()).hexdigest()
  for pid in ep['projectIds']:
   source=next(x for x in all_sources if x['id']==pid and x['lang']==lang);assert source['nativeScreenshot'] and not source['alteredDOM']
   if lang=='en':assert not re.search(r'[\u4e00-\u9fff]',source['text']),(pid,'Chinese in English native card')
  if lang=='en':assert not re.search(r'[\u4e00-\u9fff]',(out/'captions.srt').read_text())
  qa={'episode':ep['episode'],'id':ep['id'],'language':lang,'status':'passed','videoPath':str(video),'sha256':s['video_sha256'],'seconds':s['video_duration_sec'],'sampledFrames':len(errors),'maxSourceFrameMAE':round(max(errors),4),'cameraMotion':'none; source-comparison samples passed','tailAfterLastWordSeconds':round(s['video_duration_sec']-last,3),'audioSegments':audio,'voice':s['voice'],'sourceDate':'2026-11-11','projectCount':6,'dimensions':[1080,1920],'nativeProjectCards':6,'captions':'word-aligned semantic phrases','syncReport':str(out/'sync_report.json'),'paidTTS':False,'cashCNY':0}
  (out/'quality-report.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2));reports.append(qa)
  print('QA passed',ep['id'],lang,round(s['video_duration_sec'],2),flush=True)
  # A decoded frame with burned-in subtitles is saved for human visual inspection.
  frame=out/'decoded-subtitle-check.png';subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(s['timeline'][1]['start_sec']+1.2),'-i',str(video),'-frames:v','1',str(frame)],check=True)
(R/'audit/quality-summary.json').write_text(json.dumps({'status':'passed','episodes':len(episodes),'versions':len(reports),'reports':reports,'boundary':'automated frame/audio/sync verification; no claim of installing or benchmarking featured projects'},ensure_ascii=False,indent=2));print(f'ALL {len(reports)} CHECKED VERSIONS PASSED',flush=True)
