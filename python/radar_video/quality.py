"""Decode actual output: native screenshot identity, static frames, all captions and tail."""
import hashlib,json,wave
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageChops

def verify(manifest):
    out=Path(manifest).parent;m=json.loads(Path(manifest).read_text());s=json.loads((out/'sync_report.json').read_text());video=Path(s['video_path']);events=json.loads((out/'caption-timings.json').read_text())
    if hashlib.sha256(video.read_bytes()).hexdigest()!=s['video_sha256']:raise ValueError('Video hash changed')
    cap=cv2.VideoCapture(str(video));assert cap.isOpened();assert (int(cap.get(3)),int(cap.get(4)))==(1080,1920);assert abs(cap.get(cv2.CAP_PROP_FPS)-30)<.01
    errors=[];caption_errors=[];native=[]
    try:
        for c,t in zip(m['cards'],s['timeline']):
            original=cv2.imread(t['card']);sampled=[]
            for pos in [.24,.5,.76]:
                cap.set(cv2.CAP_PROP_POS_MSEC,(t['start_sec']+t['duration_sec']*pos)*1000);ok,frame=cap.read();assert ok
                mae=float(np.abs(frame[:1450].astype(np.int16)-original[:1450].astype(np.int16)).mean());assert mae<3.2;errors.append(mae);sampled.append(frame[:1450])
            assert float(np.abs(sampled[0].astype(np.int16)-sampled[-1].astype(np.int16)).mean())<1.5
            with wave.open(t['voice_path'],'rb') as f:audio=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(np.float64)
            assert np.sqrt(np.mean(audio*audio))>150
            if c['kind']=='point':
                n=c['nativeCard'];src=Path(n['source']);assert hashlib.sha256(src.read_bytes()).hexdigest()==n['sha256']
                resized=Image.open(src).convert('RGB').resize((n['width'],n['height']),Image.Resampling.LANCZOS);actual=Image.open(t['card']).convert('RGB').crop((n['x'],n['y'],n['x']+n['width'],n['y']+n['height']));assert ImageChops.difference(resized,actual).getbbox() is None;native.append(c['project_id'])
        for e in events:
            at=(e['start_frame']+e['end_frame'])/60;t=next(t for t in s['timeline'] if t['start_sec']<=at<t['end_sec']);base=Image.open(t['card']).convert('RGBA');base.alpha_composite(Image.open(e['layout']['png']),(0,1400));expected=np.array(base.convert('RGB'))[1460:1700]
            cap.set(cv2.CAP_PROP_POS_MSEC,at*1000);ok,f=cap.read();assert ok;actual=cv2.cvtColor(f,cv2.COLOR_BGR2RGB)[1460:1700];mae=float(np.abs(expected.astype(np.int16)-actual.astype(np.int16)).mean());assert mae<4;caption_errors.append(mae)
            b=e['layout']['plate_box'];ink=e['layout']['ink_boxes'];assert len(ink)<=2;assert abs((ink[0][1]+ink[-1][3])/2-1580)<1;assert ink[0][1]-b[1]>=22 and b[3]-ink[-1][3]>=22
        tail=s['video_duration_sec']-max(e['end'] for e in events);assert tail>=.78;assert len(native)==m['project_count'];assert s['card_count']==len(m['cards']);assert s['paidTTS'] is False
        # Decode joined PCM to ensure there is no audio after the final silent hold.
        with wave.open(str(out/'narration.wav'),'rb') as f:
            rate=f.getframerate();joined=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2');assert np.max(np.abs(joined[-round(rate*.75):].astype(np.int32)))==0
    finally:cap.release()
    report={'status':'passed','sha256':s['video_sha256'],'videoPath':str(video),'seconds':s['video_duration_sec'],'nativeCards':native,'captionCues':len(events),'maxCaptionPixelMAE':max(caption_errors),'maxStaticFrameMAE':max(errors),'tailAfterLastWordSeconds':tail,'voice':s['voice'],'inputSha256':m['inputSha256'],'paidTTS':False,'cashCNY':0}
    (out/'quality-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');return report

def verify_package(root):
    root=Path(root);data=json.loads((root/'episode-input.json').read_text());expected=hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False).encode()).hexdigest();reports=[verify(root/lang/'content_manifest.json') for lang in ['zh','en']]
    if any(x['inputSha256']!=expected for x in reports):raise ValueError('Bilingual input mismatch')
    receipt={'status':'passed','versions':reports,'automaticPublish':False};(root/'package-quality.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n');return receipt
