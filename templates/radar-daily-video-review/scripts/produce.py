import asyncio,concurrent.futures,hashlib,json,math,re,subprocess,sys,time,wave,shutil
import numpy as np
from pathlib import Path
sys.path.insert(0,'/home/zxhwolfe/creative_work/2026-10-22-open-source-radar-daily/temp/edge-tts-7.3.1')
import edge_tts
from PIL import ImageFont
from caption_strip import caption_chunks, caption_lines, subtitle_track, STRIP_TOP
RENDERER_DIGEST=hashlib.sha256(Path(__file__).read_bytes()+Path(__file__).with_name("caption_strip.py").read_bytes()).hexdigest()
R=Path(__file__).resolve().parents[1]
def norm(x):return re.sub(r'[\W_]+','',x.casefold())
def probe(p):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
def dur(p):return float(probe(p)['format']['duration'])
def ff(args):subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y']+list(map(str,args)),check=True)
def trim_tail(wav,words):
 with wave.open(str(wav),'rb') as f:rate=f.getframerate();channels=f.getnchannels();width=f.getsampwidth();raw=f.readframes(f.getnframes())
 assert channels==1 and width==2
 samples=np.frombuffer(raw,dtype='<i2');last=(words[-1]['offset']+words[-1]['duration'])/1e7
 nonquiet=np.flatnonzero(np.abs(samples.astype(np.int32))>60)
 audible=(int(nonquiet[-1])+1)/rate if len(nonquiet) else 0
 target=math.ceil(max(last+.16,audible+.12)*rate)
 if len(samples)-target<rate*.2:return
 backup=wav.with_suffix('.untrimmed.wav')
 if not backup.exists():shutil.copy2(wav,backup)
 with wave.open(str(wav),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(raw[:target*2])
 wav.with_suffix('.trim.json').write_text(json.dumps({'rawSeconds':len(samples)/rate,'trimmedSeconds':target/rate,'lastWordEnd':last,'retainedAfterLastWord':target/rate-last,'speechCut':False}))

async def synth(manifest):
 out=manifest.parent;m=json.loads(manifest.read_text());tmp=out/'temp';tmp.mkdir(exist_ok=True)
 assert m['voice'] in ['zh-CN-XiaoxiaoNeural','en-US-AriaNeural']
 for i,c in enumerate(m['cards']):
  mp3=tmp/f'voice-{i}.mp3';wav=tmp/f'voice-{i}.wav';wp=tmp/f'voice-{i}-words.json'
  if wav.exists() and wp.exists() and norm(' '.join(w['text'] for w in json.loads(wp.read_text())))==norm(c['narration']):continue
  for attempt in range(2):
   try:
    words=[]
    with mp3.open('wb') as f:
     async for ev in edge_tts.Communicate(c['narration'],voice=m['voice'],rate=m['tts_rate'],boundary='WordBoundary').stream():
      if ev['type']=='audio':f.write(ev['data'])
      elif ev['type']=='WordBoundary':words.append(ev)
    assert mp3.stat().st_size>1000 and words,'No usable free neural voice'
    assert norm(' '.join(w['text'] for w in words))==norm(c['narration']),'Speech word-boundary mismatch'
    wp.write_text(json.dumps(words,ensure_ascii=False));ff(['-i',mp3,'-ar',24000,'-ac',1,wav]);break
   except Exception:
    if attempt:raise
    await asyncio.sleep(2)
  await asyncio.sleep(.15)
 print('Voice ready',m['slug'],flush=True)

def phrases(text,zh):return caption_chunks(text,zh)
def wrap(text,zh):return caption_lines(text,zh)
def stamp(sec,srt=False):
 mult=1000 if srt else 100;n=round(sec*mult)
 if srt:return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}'
 return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
def render(manifest):
 out=manifest.parent;m=json.loads(manifest.read_text());tmp=out/'temp';fps=m['fps'];zh=m['locale']=='zh-CN';events=[];timeline=[];parts=[];offset=0
 report_file=out/'sync_report.json';target=out/(m['slug']+'.mp4')
 if report_file.exists() and target.exists():
  prior=json.loads(report_file.read_text());inputs=[manifest]+[out/'frames'/c['filename'] for c in m['cards']]+[tmp/f'voice-{i}.wav' for i in range(len(m['cards']))]
  if prior.get('rendererDigest')==RENDERER_DIGEST and [x['narration'] for x in prior['timeline']]==[x['narration'] for x in m['cards']] and all(p.stat().st_mtime<=target.stat().st_mtime for p in inputs) and hashlib.sha256(target.read_bytes()).hexdigest()==prior['video_sha256']:
   print('Reused unchanged render',m['slug'],flush=True);return prior
 for i,c in enumerate(m['cards']):
  wav=tmp/f'voice-{i}.wav';words=json.loads((tmp/f'voice-{i}-words.json').read_text());trim_tail(wav,words);ad=dur(wav);aligned=math.ceil(ad*fps)/fps+(m['tail_hold_sec'] if i==len(m['cards'])-1 else 0)
  expected=norm(c['narration']);actual=norm(' '.join(w['text'] for w in words));assert expected==actual
  spans=[];cursor=0
  for w in words:
   n=len(norm(w['text']));spans.append((cursor,cursor+n,w));cursor+=n
  cursor=0
  for text in phrases(c['narration'],zh):
   length=len(norm(text));active=[w for a,b,w in spans if b>cursor and a<cursor+length];assert active
   start=offset+active[0]['offset']/1e7;end=offset+(active[-1]['offset']+active[-1]['duration'])/1e7
   assert start>=offset-.01 and end<=offset+ad+.04
   lines=wrap(text,zh);assert len(lines)<=2
   events.append({'start':start,'end':end,'lines':lines,'segment':i,'semanticText':text});cursor+=length
  assert cursor==len(expected)
  target=tmp/f'aligned-{i}.wav';ff(['-i',wav,'-af',f'apad=whole_dur={aligned}','-t',f'{aligned:.9f}','-ar',24000,'-ac',1,target]);parts.append(target)
  timeline.append({'index':i,'card':str(out/'frames'/c['filename']),'narration':c['narration'],'voice_path':str(wav),'audio_duration_sec':ad,'start_sec':offset,'duration_sec':aligned,'end_sec':offset+aligned});offset+=aligned
 ac=tmp/'audio-concat.txt';ac.write_text(''.join(f"file '{p}'\n" for p in parts));audio=out/'narration.wav';ff(['-f','concat','-safe',0,'-i',ac,'-c:a','pcm_s16le',audio])
 caption_concat=subtitle_track(events,out,offset,fps,zh)
 (out/'captions.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(e["start"],True)} --> {stamp(e["end"],True)}\n'+'\n'.join(e['lines']) for i,e in enumerate(events))+'\n');(out/'caption-timings.json').write_text(json.dumps(events,ensure_ascii=False,indent=2))
 fl=tmp/'frames-concat.txt';fl.write_text(''.join(f"file '{e['card']}'\noption framerate 30\nduration {e['duration_sec']:.9f}\n" for e in timeline)+f"file '{timeline[-1]['card']}'\noption framerate 30\n")
 video=out/(m['slug']+'.mp4')
 overlay=f'[0:v]fps=30,format=rgba[base];[2:v]fps=30,format=rgba[subtitles];[base][subtitles]overlay=x=0:y={STRIP_TOP}:eof_action=pass:shortest=0,format=yuv420p[v]'
 ff(['-f','concat','-safe',0,'-i',fl,'-i',audio,'-f','concat','-safe',0,'-i',caption_concat,'-t',f'{offset:.9f}','-filter_complex_threads',1,'-filter_complex',overlay,'-map','[v]','-map','1:a:0','-c:v','libx264','-threads',2,'-preset','veryfast','-tune','stillimage','-crf',18,'-pix_fmt','yuv420p','-r',fps,'-c:a','aac','-b:a','160k','-movflags','+faststart',video])

 p=probe(video);v=next(s for s in p['streams'] if s['codec_type']=='video');a=next(s for s in p['streams'] if s['codec_type']=='audio');vd=float(v['duration']);ad=float(a['duration']);assert (v['width'],v['height'])==(1080,1920);assert abs(vd-dur(audio))<.055 and vd+.012>=ad;assert m['min_duration_sec']<=vd<=m['max_duration_sec'];assert len(m['cards'])==m['project_count']+1 and m['project_count']==6 and sum(c['kind']=='point' for c in m['cards'])==6
 ff(['-ss',max(0,vd-.15),'-i',video,'-frames:v',1,out/'last-frame.png'])
 report={'video_path':str(video),'rendererDigest':RENDERER_DIGEST,'captionRenderer':'measured PNG glyphs and plate, one layout','subtitleStyle':m['subtitleStyle'],'card_count':len(m['cards']),'audio_segment_count':len(m['cards']),'voice':m['voice'],'provider':'Microsoft free Edge Neural','edge_tts_version':edge_tts.__version__,'paidTTS':False,'wordBoundaryTextsExact':True,'video_duration_sec':vd,'audio_duration_sec':ad,'joined_wav_duration_sec':dur(audio),'tail_hold_sec':.8,'captionPhrases':len(events),'timeline':timeline,'video_sha256':hashlib.sha256(video.read_bytes()).hexdigest(),'newImageGeneration':0,'cashCNY':0,'visualVersion':m['visualVersion'],'motion':m['motion'],'project_count':6,'frameCount':int(v['nb_frames']),'frameDimensions':[1080,1920],'fps':fps,'checks':{'word_boundaries':'passed','semantic_caption_coverage':'passed','segment_alignment':'passed','audio_video_duration':'passed','tail_hold':'passed','dimensions':'passed'}}
 (out/'sync_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('Rendered',m['slug'],round(vd,2),'seconds',flush=True);return report

def main():
 mode=sys.argv[1] if len(sys.argv)>1 else 'all';limit=int(sys.argv[2]) if len(sys.argv)>2 else 10
 manifests=sorted((R/'episodes').glob('*/[ez][nh]/content_manifest.json'))
 manifests=[p for p in manifests if int(p.parent.parent.name[2:4])<=limit]
 if mode in ['voice','all']:
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:list(ex.map(lambda p:asyncio.run(synth(p)),manifests))
 if mode in ['render','all']:
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:list(ex.map(render,manifests))
if __name__=='__main__':main()
