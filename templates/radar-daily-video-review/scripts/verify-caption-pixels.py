from pathlib import Path
import json,cv2,numpy as np
from PIL import Image
r=Path(__file__).resolve().parents[1];rows=[]
for lang in ['zh','en']:
 out=r/'episodes/ep16-daily-ranking'/lang;s=json.loads((out/'sync_report.json').read_text());events=json.loads((out/'caption-timings.json').read_text());cap=cv2.VideoCapture(s['video_path']);worst=0
 for e in events:
  at=(e['start_frame']+e['end_frame'])/60;scene=next(t for t in s['timeline'] if t['start_sec']<=at<t['end_sec']);base=Image.open(scene['card']).convert('RGBA');strip=Image.open(e['layout']['png']);base.alpha_composite(strip,(0,1400));expected=np.array(base.convert('RGB'))[1460:1700];cap.set(cv2.CAP_PROP_POS_MSEC,at*1000);ok,frame=cap.read();assert ok;actual=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)[1460:1700];mae=float(np.abs(expected.astype('int16')-actual.astype('int16')).mean());assert mae<4,(lang,at,mae);worst=max(worst,mae)
  b=e['layout']['plate_box'];boxes=e['layout']['ink_boxes'];assert len(boxes)<=2;assert abs((boxes[0][1]+boxes[-1][3])/2-1580)<1;assert boxes[0][1]-b[1]>=22 and b[3]-boxes[-1][3]>=22
 cap.release();rows.append(dict(language=lang,cues=len(events),maxCaptionPixelMAE=round(worst,3),status='passed'))
(r/'audit/decoded-caption-pixels.json').write_text(json.dumps(rows,indent=2));print(rows)
