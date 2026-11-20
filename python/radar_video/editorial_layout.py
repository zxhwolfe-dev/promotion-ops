"""Task-first reading layer around an unchanged native screenshot."""
import hashlib
from pathlib import Path
from PIL import Image
from .layout import base, text, BLUE


def editorial_frame(card, day, lang, target):
    im, draw = base(day, lang)
    layer = card['readingLayer']
    lines = layer['headlineLines']
    if not 1 <= len(lines) <= 2:
        raise ValueError('Task headline needs one or two deliberately written lines')
    for i, line in enumerate(lines):
        text(draw, line, (68, 164+i*76), 60, lang)
    text(draw, layer['projectName'], (68, 346), 38, lang, BLUE)
    text(draw, layer['task'], (68, 410), 36, lang)
    text(draw, layer['condition'], (68, 468), 28, lang)
    src = Path(card['source']['file'])
    original = Image.open(src).convert('RGB')
    scale = min(944/original.width, 810/original.height)
    width, height = round(original.width*scale), round(original.height*scale)
    x, y = 68+(944-width)//2, 542
    im.paste(original.resize((width, height), Image.Resampling.LANCZOS), (x, y))
    note = '榜单快照 '+day+' · 项目自述，未实测' if lang == 'zh' else 'Snapshot '+day+' | Project claims; not tested'
    text(draw, note, (68, 1364), 23, lang, '#52627A')
    im.save(target)
    return dict(source=str(src), sha256=hashlib.sha256(src.read_bytes()).hexdigest(),
                x=x, y=y, width=width, height=height, completeNativeCard=True, alteredDOM=False)
