"""Validated bilingual episode input. Dates and ranks are evidence, never guessed."""
import datetime,hashlib,json,re
from pathlib import Path
from urllib.parse import urlparse
from .layout import frame,outro,covers
VOICES={'zh':'zh-CN-XiaoxiaoNeural','en':'en-US-AriaNeural'}
def validate(data):
    for key in ['publicationDate','sourceDate']:datetime.date.fromisoformat(data[key])
    if not isinstance(data['episode'],int) or data['episode']<1:raise ValueError('Positive episode required')
    projects=data['projects']
    if not 6<=len(projects)<=8 or len({p['id'] for p in projects})!=len(projects):raise ValueError('Need six to eight distinct projects')
    for p in projects:
        if not re.fullmatch(r'[a-zA-Z0-9_-]+',p['id']):raise ValueError('Invalid project ID')
        for lang in VOICES:
            c=p[lang];src=c['source'];file=Path(src['file'])
            if not c['headline'].strip() or not c['narration'].strip():raise ValueError('Missing reviewed copy')
            if src.get('nativeScreenshot') is not True or src.get('alteredDOM') is not False or not file.is_file():raise ValueError('Missing complete native screenshot')
            if not isinstance(src['rank'],int) or src['rank']<1:raise ValueError('Missing native rank')
            if urlparse(src['url']).hostname not in {'aiworkstation.cn','useaistation.com'}:raise ValueError('Not an original Radar source')
            captured=datetime.datetime.fromisoformat(src['capturedAt'].replace('Z','+00:00'))
            if captured.tzinfo is None:raise ValueError('Capture timezone required')
            if captured.astimezone(datetime.timezone(datetime.timedelta(hours=8))).date().isoformat()!=data['sourceDate']:raise ValueError('Source date disagrees with capture')
            if src['sha256']!=hashlib.sha256(file.read_bytes()).hexdigest():raise ValueError('Native screenshot changed')
            if lang=='en' and re.search(r'[\u4e00-\u9fff]',c['headline']+c['narration']):raise ValueError('English version contains Chinese')
    return data

def prepare(data,root):
    validate(data);root=Path(root);root.mkdir(parents=True,exist_ok=True)
    source_hash=hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False).encode()).hexdigest();lock=root/'episode-input.json'
    if lock.exists() and json.loads(lock.read_text())!=data:raise ValueError('Existing episode inputs differ; use a new output directory')
    lock.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');manifests=[]
    for lang,voice in VOICES.items():
        out=root/lang;(out/'frames').mkdir(parents=True,exist_ok=True);cards=[]
        for i,p in enumerate(data['projects']):
            c=p[lang];name=f'card-{i+1:02d}.png';native=frame(c,data['sourceDate'],lang,out/'frames'/name)
            cards.append(dict(id=p['id'],kind='point',project_id=p['id'],rank=c['source']['rank'],filename=name,headline=c['headline'],narration=c['narration'],nativeCard=native))
        name=f'card-{len(cards)+1:02d}.png';outro(data['sourceDate'],lang,out/'frames'/name)
        cards.append(dict(id='radar-entry',kind='summary',filename=name,narration='本期是资料选型介绍，使用前核对运行条件和原仓库许可。完整项目卡和来源，在AI开源项目雷达。' if lang=='zh' else 'Source-based profiles, not hands-on tests. Check setup and upstream licenses. Explore the full cards and sources in AI Open Source Radar.'))
        manifest=dict(slug=f"radar-{data['publicationDate']}-ep{data['episode']}-{lang}",title=data['titles'][lang],locale='zh-CN' if lang=='zh' else 'en-US',voice=voice,tts_rate='+4%',fps=30,canvas={'width':1080,'height':1920},tail_hold_sec=.8,min_duration_sec=20,max_duration_sec=180,project_count=len(data['projects']),cards=cards,visualVersion='native-editorial-large-pixel-subtitles-v1',motion='none',sourceDate=data['sourceDate'],publicationDate=data['publicationDate'],inputSha256=source_hash,subtitleStyle={'fontPixels':70 if lang=='zh' else 64,'centerY':1580,'maxLines':2})
        covers(data,lang,out)
        path=out/'content_manifest.json';path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');manifests.append(path)
    return manifests
