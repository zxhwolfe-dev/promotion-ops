import json,hashlib,wave,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

R=Path(__file__).resolve().parents[1];OLD=R.parent
FONT=Path('/mnt/c/Windows/Fonts');BG='#F6F7F9';INK='#11213C';BLUE='#245ADF';MUTED='#65748A'
EP=json.loads((R/'episodes.json').read_text())[0];PROJECTS=EP['projects']
CAPTURES=json.loads((R/'references/cards/capture-manifest.json').read_text())
def font(size,bold=False,lang='zh'):
    return ImageFont.truetype(str(FONT/(('msyhbd.ttc' if bold else 'msyh.ttc') if lang=='zh' else ('segoeuib.ttf' if bold else 'segoeui.ttf'))),size)
def text(draw,s,xy,size=36,color=INK,bold=False,lang='zh',maxw=952):
    f=font(size,bold,lang)
    if draw.textlength(s,font=f)>maxw:raise ValueError('Text overflows: '+s)
    b=draw.textbbox(xy,s,font=f)
    if b[2]>1016 or b[3]>1440:raise ValueError('Text outside content safe area: '+s)
    draw.text(xy,s,font=f,fill=color)
def heading(draw,s,y,lang,size=58):
    tokens=list(s) if lang=='zh' else s.split();rows=[];line=''
    for token in tokens:
        candidate=line+(' ' if line and lang=='en' else '')+token
        if draw.textlength(candidate,font=font(size,True,lang))>944:rows.append(line);line=token
        else:line=candidate
    if line:rows.append(line)
    if len(rows)>2:raise ValueError('Heading exceeds two lines')
    for i,line in enumerate(rows):text(draw,line,(68,y+i*(size+12)),size,INK,True,lang)
def base(lang):
    im=Image.new('RGB',(1080,1920),BG);d=ImageDraw.Draw(im)
    d.rounded_rectangle((68,73,76,111),radius=4,fill=BLUE)
    text(d,'AI开源项目雷达' if lang=='zh' else 'AI OPEN SOURCE RADAR',(94,70),32,INK,True,lang,800)
    text(d,'11.11',(899,78),28,MUTED,True,'en',120)
    return im,d
def trim_existing_summary(lang,out,narration):
    source=OLD/'episodes/ep16-daily-ranking'/lang/'temp';words=json.loads((source/'voice-7-words.json').read_text())
    norm=lambda s:__import__('re').sub(r'[\W_]+','',s.casefold())
    all_text=norm(''.join(w['text'] for w in words));needle=norm(narration);begin=all_text.index(needle);cursor=0;selected=[]
    for w in words:
        end=cursor+len(norm(w['text']))
        if end>begin:selected.append(w.copy())
        cursor=end
    assert norm(''.join(w['text'] for w in selected))==needle
    with wave.open(str(source/'voice-7.wav'),'rb') as f:
        rate=f.getframerate();channels=f.getnchannels();width=f.getsampwidth();raw=f.readframes(f.getnframes())
    start=max(0,math.floor((selected[0]['offset']/1e7-.065)*rate));cut=start/rate
    for w in selected:w['offset']-=round(cut*1e7)
    target=out/'temp/voice-6.wav'
    with wave.open(str(target),'wb') as f:f.setnchannels(channels);f.setsampwidth(width);f.setframerate(rate);f.writeframes(raw[start*channels*width:])
    (out/'temp/voice-6-words.json').write_text(json.dumps(selected,ensure_ascii=False))

for lang in ['zh','en']:
    out=R/'episodes/ep16-daily-ranking'/lang;(out/'frames').mkdir(parents=True,exist_ok=True)
    prior=json.loads((OLD/'episodes/ep16-daily-ranking'/lang/'content_manifest.json').read_text());cards=[]
    for project in PROJECTS:
        source=next(c for c in CAPTURES if c['id']==project['id'] and c['lang']==lang)
        old_card=next(c for c in prior['cards'] if c.get('project_id')==project['id']);im,d=base(lang)
        heading(d,project[lang],166,lang)
        original=Image.open(source['file']).convert('RGB');scale=min(944/original.width,1070/original.height)
        w,h=round(original.width*scale),round(original.height*scale);x=68+(944-w)//2;y=340
        im.paste(original.resize((w,h),Image.Resampling.LANCZOS),(x,y))
        filename=f'card-{len(cards)+1:02d}.png';im.save(out/'frames'/filename)
        cards.append({**old_card,'id':f'project-{len(cards)+1}','filename':filename,'nativeCard':{'source':source['file'],'sha256':hashlib.sha256(Path(source['file']).read_bytes()).hexdigest(),'x':x,'y':y,'width':w,'height':h,'completeNativeCard':True,'alteredDOM':False}})
    im,d=base(lang)
    text(d,'找到适合你的' if lang=='zh' else 'Find the tool',(68,242),72,INK,True,lang,944)
    text(d,'下一个AI项目' if lang=='zh' else 'for your next task.',(68,336),72,INK,True,lang,944)
    text(d,'完整项目卡与来源' if lang=='zh' else 'Full project cards and sources',(68,509),40,BLUE,True,lang,944)
    d.rounded_rectangle((68,688,1012,1120),radius=32,fill=INK)
    text(d,'AI开源项目雷达' if lang=='zh' else 'AI Open Source Radar',(110,770),48,'#FFFFFF',True,lang,850)
    text(d,'按用途，继续发现' if lang=='zh' else 'Explore by what you need to do',(110,864),34,'#D0DCFA',False,lang,850)
    text(d,'aiworkstation.cn/githubai/' if lang=='zh' else 'useaistation.com/githubai/',(110,999),40,'#FFFFFF',True,'en',850)
    end='完整项目卡和来源，在AI开源项目雷达。' if lang=='zh' else 'Explore the full cards and sources in AI Open Source Radar.'
    filename='card-07.png';im.save(out/'frames'/filename);cards.append({'id':'radar-entry','kind':'summary','filename':filename,'headline':'雷达入口' if lang=='zh' else 'Explore the Radar','narration':end})
    trim_existing_summary(lang,out,end)
    prior.update(cards=cards,output_root=str(out),slug='radar-daily-20261111-v2-'+lang,visualVersion='native-editorial-v2-large-pixel-subtitles',platforms=['douyin','bilibili'] if lang=='zh' else ['tiktok','youtube-shorts','x'],subtitleStyle={'renderer':'measured-png-overlay','fontPixels':70 if lang=='zh' else 64,'centerY':1580,'maxLines':2,'backgroundAndText':'shared pixel layout'},claimBoundary=prior['claimBoundary'])
    (out/'content_manifest.json').write_text(json.dumps(prior,ensure_ascii=False,indent=2)+'\n')
    info=json.loads((OLD/'episodes/ep16-daily-ranking'/lang/'publish-info.json').read_text());info.update(status='awaiting_user_approval',visualRevision=2,videoFilename=prior['slug']+'.mp4');(out/'publish-info.json').write_text(json.dumps(info,ensure_ascii=False,indent=2))
    print('Prepared v2',lang,len(cards),'scenes; large subtitles; original six narration segments reused.')
