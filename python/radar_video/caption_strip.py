"""Measured pixel subtitles: the plate and glyphs share one layout and clock."""
import json,re,os
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

WIDTH,STRIP_TOP,STRIP_HEIGHT,CENTER_Y=1080,1400,360,1580
PLATE_WIDTH,TEXT_WIDTH,PAD_Y,LINE_GAP=944,872,22,14
FONT_DIR=Path(os.environ.get('PROMO_VIDEO_FONT_DIR','/mnt/c/Windows/Fonts'))

def face(zh):
    return ImageFont.truetype(str(FONT_DIR/('msyhbd.ttc' if zh else 'segoeuib.ttf')),70 if zh else 64)

def cuts(text):
    for i in range(1,len(text)):
        left,right=text[:i].strip(),text[i:].strip()
        if not left or not right:continue
        if right[0] in '，。！？；、：,.!?;:)]）】':continue
        if left[-1] in '([（【':continue
        if text[i-1].isascii() and text[i-1].isalnum() and text[i].isascii() and text[i].isalnum():continue
        yield i

def caption_lines(text,zh):
    f=face(zh);text=text.strip()
    if f.getlength(text)<=TEXT_WIDTH:return [text]
    options=[(abs(f.getlength(text[:i].strip())-f.getlength(text[i:].strip())),i)
             for i in cuts(text) if f.getlength(text[:i].strip())<=TEXT_WIDTH and f.getlength(text[i:].strip())<=TEXT_WIDTH]
    if not options:raise ValueError('Caption needs another timed cue: '+text)
    _,i=min(options);return [text[:i].strip(),text[i:].strip()]

def fits(text,zh):
    try:caption_lines(text,zh);return True
    except ValueError:return False

def split_clause(text,zh):
    if fits(text,zh):return [text]
    candidates=[i for i in cuts(text) if fits(text[:i],zh)]
    if not candidates:raise ValueError('Unbreakable caption token: '+text)
    balanced=[i for i in candidates if fits(text[i:],zh)]
    i=min(balanced,key=lambda n:abs(n-len(text)/2)) if balanced else max(candidates)
    return [text[:i].strip()]+split_clause(text[i:].strip(),zh)

def caption_chunks(text,zh):
    clauses=[s.strip() for s in re.findall(r'[^。；！？.!?,，;:：]+[。；！？.!?,，;:：]*',text) if s.strip()]
    pieces=[part for clause in clauses for part in split_clause(clause,zh)];result=[]
    norm=lambda s:re.sub(r'[\W_]+','',s.casefold())
    for part in pieces:
        separator='' if zh else ' '
        if result and min(len(norm(result[-1])),len(norm(part)))<(6 if zh else 12) and fits(result[-1]+separator+part,zh):
            result[-1]+=separator+part
        else:result.append(part)
    assert norm(''.join(result))==norm(text)
    return result

def render_strip(lines,zh,path):
    image=Image.new('RGBA',(WIDTH,STRIP_HEIGHT),(0,0,0,0));draw=ImageDraw.Draw(image);f=face(zh)
    bounds=[draw.textbbox((0,0),line,font=f) for line in lines]
    heights=[b[3]-b[1] for b in bounds];ink_height=sum(heights)+LINE_GAP*(len(lines)-1)
    height=ink_height+PAD_Y*2
    if height>240:raise ValueError('Caption exceeds safe plate height')
    cx,cy=WIDTH/2,CENTER_Y-STRIP_TOP;left=(WIDTH-PLATE_WIDTH)/2;top=cy-height/2
    draw.rounded_rectangle((left,top,left+PLATE_WIDTH,top+height),radius=24,fill=(16,33,59,248))
    cursor=cy-ink_height/2;ink=[]
    for line,b,h in zip(lines,bounds,heights):
        w=b[2]-b[0];x=cx-w/2-b[0];y=cursor-b[1]
        draw.text((x,y),line,font=f,fill=(255,255,255,255))
        box=[cx-w/2,cursor+STRIP_TOP,cx+w/2,cursor+h+STRIP_TOP];ink.append(box);cursor+=h+LINE_GAP
        if box[0]<left+32 or box[2]>left+PLATE_WIDTH-32:raise ValueError('Caption leaves horizontal padding')
    image.save(path)
    plate=[left,top+STRIP_TOP,left+PLATE_WIDTH,top+height+STRIP_TOP]
    assert plate[1]>=1460 and plate[3]<=1700
    return {'font_px':70 if zh else 64,'font':f.path,'plate_box':plate,'ink_boxes':ink,'center':[cx,CENTER_Y],
            'vertical_padding_px':PAD_Y,'line_gap_px':LINE_GAP,'lines':lines,'png':str(path)}

def subtitle_track(events,out,total_seconds,fps,zh):
    directory=out/'subtitles';directory.mkdir(exist_ok=True)
    blank=directory/'transparent.png';Image.new('RGBA',(WIDTH,STRIP_HEIGHT),(0,0,0,0)).save(blank)
    segments=[];cursor=0;total_frames=round(total_seconds*fps)
    for i,event in enumerate(events):
        start=max(cursor,round(event['start']*fps));end=max(start+1,round(event['end']*fps));end=min(end,total_frames)
        if start>cursor:segments.append({'png':str(blank),'frames':start-cursor})
        png=directory/f'cue-{i+1:03d}.png';layout=render_strip(event['lines'],zh,png)
        event.update(layout=layout,start_frame=start,end_frame=end)
        segments.append({'png':str(png),'frames':end-start});cursor=end
    if cursor<total_frames:segments.append({'png':str(blank),'frames':total_frames-cursor})
    assert sum(s['frames'] for s in segments)==total_frames
    concat=directory/'track.ffconcat'
    concat.write_text('ffconcat version 1.0\n'+''.join(f"file '{s['png']}'\noption framerate {fps}\nduration {s['frames']/fps:.9f}\n" for s in segments)+f"file '{blank}'\noption framerate {fps}\n")
    (directory/'layout-report.json').write_text(json.dumps({'status':'passed','centerY':CENTER_Y,'stripTop':STRIP_TOP,
        'fontPixels':70 if zh else 64,'plateWidth':PLATE_WIDTH,'maxTextWidth':TEXT_WIDTH,'totalFrames':total_frames,
        'segments':segments,'cues':[e['layout'] for e in events]},ensure_ascii=False,indent=2))
    return concat
