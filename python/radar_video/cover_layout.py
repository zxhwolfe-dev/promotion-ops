"""Covers reuse the episode's real cards; no unrelated illustration or fake rank."""
import math
from pathlib import Path
from PIL import Image,ImageDraw
from .layout import font,text,INK,BLUE

def lines(draw,value,face,width,lang):
    rows=[];line=''
    for token in list(value) if lang=='zh' else value.split():
        candidate=line+(' ' if lang=='en' and line else '')+token
        if draw.textlength(candidate,font=face)>width:
            if not line:raise ValueError('Cover word exceeds tile width')
            rows.append(line);line=token
        else:line=candidate
    if line:rows.append(line)
    return rows

def render_covers(data,lang,out):
    projects=data['projects'];out=Path(out)
    for name,size,cols in [('cover-safe-4x3.png',(1600,1200),3),('cover-safe-3x4.png',(1080,1440),2)]:
        width,height=size;im=Image.new('RGB',size,'#EDF2FA');d=ImageDraw.Draw(im)
        header=365 if cols==3 else 440
        d.rectangle((0,0,width,header),fill=INK);d.rectangle((0,0,18,header),fill=BLUE)
        brand='AI开源项目雷达' if lang=='zh' else 'AI OPEN SOURCE RADAR'
        text(d,brand,(64,48),32,lang,'#91B4FF',width-128)
        heading=data['titles'][lang]
        for points in [66,60,54]:
            title_lines=lines(d,heading,font(points,lang),width-128,lang)
            if len(title_lines)<=3:break
        if len(title_lines)>3:raise ValueError('Cover title exceeds three readable lines')
        for i,row in enumerate(title_lines):text(d,row,(64,125+i*(points+14)),points,lang,'white',width-128)
        subtitle='按任务看用途 · 保留原始名次' if lang=='zh' else 'Real project cards. Match the task first.'
        text(d,subtitle,(64,header-60),27,lang,'#BDCCE6',width-128)
        margin,gap,top,bottom=54,20,header+36,100
        rows=math.ceil(len(projects)/cols);cellw=(width-margin*2-gap*(cols-1))//cols
        cellh=(height-top-bottom-gap*(rows-1))//rows
        if cellh<150:raise ValueError('Too many cards for a readable cover')
        for i,project in enumerate(projects):
            c=project[lang];x=margin+(i%cols)*(cellw+gap);y=top+(i//cols)*(cellh+gap)
            d.rounded_rectangle((x,y,x+cellw,y+cellh),radius=16,fill='white',outline='#D7E2F2',width=2)
            native=Image.open(c['source']['file']).convert('RGB');native.thumbnail((100,cellh-32),Image.Resampling.LANCZOS)
            im.paste(native,(x+15,y+(cellh-native.height)//2))
            tx=x+132;available=cellw-150
            rank=('原榜 #' if lang=='zh' else 'Rank #')+str(c['source']['rank'])
            text(d,rank,(tx,y+19),23,'zh' if lang=='zh' else 'en',BLUE,available)
            for points in [32,28,24]:
                task=lines(d,c['headline'],font(points,lang),available,lang)
                if len(task)<=3 and len(task)*(points+8)<=cellh-74:break
            if len(task)>3 or len(task)*(points+8)>cellh-74:raise ValueError('Cover task headline overflow')
            for j,row in enumerate(task):text(d,row,(tx,y+60+j*(points+8)),points,lang,INK,available)
        footer=data['sourceDate']+'  ·  '+str(len(projects))+('个项目精选' if lang=='zh' else ' project picks')
        text(d,footer,(margin,height-65),28,lang,BLUE,width-margin*2)
        im.save(out/name)
