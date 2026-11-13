"""Fixed editorial layout; the full native card is preserved without camera motion."""
import hashlib,os
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
FONT=Path(os.environ.get('PROMO_VIDEO_FONT_DIR','/mnt/c/Windows/Fonts'))
BG,INK,BLUE='#F6F7F9','#11213C','#245ADF'
def font(size,lang,bold=True):
    name=('msyhbd.ttc' if bold else 'msyh.ttc') if lang=='zh' else ('segoeuib.ttf' if bold else 'segoeui.ttf')
    return ImageFont.truetype(str(FONT/name),size)
def text(draw,value,xy,size,lang,fill=INK,width=944):
    face=font(size,lang)
    if draw.textlength(value,font=face)>width:raise ValueError('Text overflow: '+value)
    draw.text(xy,value,font=face,fill=fill)
def base(day,lang):
    im=Image.new('RGB',(1080,1920),BG);d=ImageDraw.Draw(im)
    d.rounded_rectangle((68,73,76,111),radius=4,fill=BLUE)
    text(d,'AI开源项目雷达' if lang=='zh' else 'AI OPEN SOURCE RADAR',(94,70),32,lang,width=800)
    text(d,day[5:].replace('-','.'),(899,78),28,'en',width=120)
    return im,d
def frame(card,day,lang,target):
    im,d=base(day,lang);value=card['headline'];tokens=list(value) if lang=='zh' else value.split();rows=[];line=''
    for token in tokens:
        candidate=line+(' ' if lang=='en' and line else '')+token
        if d.textlength(candidate,font=font(58,lang))>944:rows.append(line);line=token
        else:line=candidate
    if line:rows.append(line)
    if len(rows)>2:raise ValueError('Headline exceeds two lines')
    for i,line in enumerate(rows):text(d,line,(68,166+i*70),58,lang)
    src=Path(card['source']['file']);original=Image.open(src).convert('RGB')
    scale=min(944/original.width,1070/original.height);w,h=round(original.width*scale),round(original.height*scale);x=68+(944-w)//2;y=340
    im.paste(original.resize((w,h),Image.Resampling.LANCZOS),(x,y));im.save(target)
    return {'source':str(src),'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'x':x,'y':y,'width':w,'height':h,'completeNativeCard':True,'alteredDOM':False}
def outro(day,lang,target):
    im,d=base(day,lang)
    for y,zh,en in [(242,'找到适合你的','Find the tool'),(336,'下一个AI项目','for your next task.')]:text(d,zh if lang=='zh' else en,(68,y),72,lang)
    text(d,'完整项目卡与来源' if lang=='zh' else 'Full project cards and sources',(68,509),40,lang,BLUE)
    d.rounded_rectangle((68,688,1012,1120),radius=32,fill=INK)
    text(d,'AI开源项目雷达' if lang=='zh' else 'AI Open Source Radar',(110,770),48,lang,'white',850)
    text(d,'按用途，继续发现' if lang=='zh' else 'Explore by what you need to do',(110,864),34,lang,'#D0DCFA',850)
    text(d,('aiworkstation.cn' if lang=='zh' else 'useaistation.com')+'/githubai/',(110,999),40,'en','white',850)
    im.save(target)

def covers(data,lang,out):
    from .cover_layout import render_covers
    render_covers(data,lang,out)
