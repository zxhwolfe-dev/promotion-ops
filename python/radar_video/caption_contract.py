"""Explicit semantic cues retain Microsoft word timestamps without splitting words."""
import re
from .caption_strip import face, TEXT_WIDTH


def explicit_cues(narration, cues, zh):
    if not isinstance(cues, list) or not cues:
        raise ValueError('Nonempty explicit caption cues required')
    result = []
    for lines in cues:
        if not isinstance(lines, list) or not 1 <= len(lines) <= 2:
            raise ValueError('Each caption cue needs one or two explicit lines')
        if any(not isinstance(line, str) or not line.strip() or face(zh).getlength(line) > TEXT_WIDTH for line in lines):
            raise ValueError('Explicit caption line empty or too wide')
        result.append((('' if zh else ' ').join(lines), lines))
    joined = ('' if zh else ' ').join(text for text, _ in result)
    norm = lambda s: re.sub(r'[\W_]+', '', s.casefold())
    if norm(joined) != norm(narration):
        raise ValueError('Explicit captions must cover narration exactly')
    if not zh and re.findall(r"[\w]+(?:['’][\w]+)*", joined.casefold()) != re.findall(r"[\w]+(?:['’][\w]+)*", narration.casefold()):
        raise ValueError('English captions cannot split a word across cues or lines')
    return result
