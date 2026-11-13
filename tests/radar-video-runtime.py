import hashlib,importlib.util,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'python'))
from radar_video.episode import prepare,validate
from radar_video.caption_strip import caption_lines,render_strip
class RuntimeContract(unittest.TestCase):
 def fixture(self,root,n=6):
  src=root/'native.png';Image.new('RGB',(800,1000),'white').save(src);sha=hashlib.sha256(src.read_bytes()).hexdigest();ps=[]
  for i in range(n):
   p={'id':'project-'+str(i)}
   for lang in ['zh','en']:p[lang]={'headline':'项目工具' if lang=='zh' else 'Project tool','narration':'这是原始资料中的完整介绍。' if lang=='zh' else 'This is a complete source sentence.','source':{'file':str(src),'url':'https://aiworkstation.cn/githubai/rankings/daily/','rank':i+1,'capturedAt':'2026-11-13T04:00:00Z','nativeScreenshot':True,'alteredDOM':False,'sha256':sha}}
   ps.append(p)
  return dict(episode=23,publicationDate='2026-11-13',sourceDate='2026-11-13',titles={'zh':'按任务看六个项目','en':'Six projects by task'},projects=ps)
 def test_six_to_eight_new_episode_and_outro_have_no_ep16_audio_dependency(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t)
   for n in [6,8]:
    data=self.fixture(root,n);ms=prepare(data,root/str(n));self.assertEqual(len(ms),2)
    for m in ms:
     d=json.loads(m.read_text());self.assertEqual(d['project_count'],n);self.assertEqual(len(d['cards']),n+1);self.assertIn('ep23',d['slug']);self.assertEqual(d['sourceDate'],'2026-11-13');self.assertTrue((m.parent/'cover-safe-3x4.png').exists())
 def test_bad_counts_changed_images_and_mixed_english_fail(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);data=self.fixture(root,5)
   with self.assertRaises(ValueError):validate(data)
   data=self.fixture(root);data['projects'][0]['en']['narration']='英文混入中文'
   with self.assertRaises(ValueError):validate(data)
   data=self.fixture(root);data['projects'][0]['zh']['source']['sha256']='0'*64
   with self.assertRaises(ValueError):validate(data)
 def test_caption_glyph_center_and_shared_background_for_both_languages(self):
  with tempfile.TemporaryDirectory() as t:
   for zh,text in [(True,'字幕必须清晰，并在背景中居中。'),(False,'Choose the task before choosing a project.')]:
    a=render_strip(caption_lines(text,zh),zh,Path(t)/('zh.png' if zh else 'en.png'));self.assertEqual(a['font_px'],70 if zh else 64);self.assertAlmostEqual((a['ink_boxes'][0][1]+a['ink_boxes'][-1][3])/2,1580);self.assertGreaterEqual(a['plate_box'][1],1460)
if __name__=='__main__':unittest.main()
