#!/usr/bin/env python3
"""Local episode builder; prepare is offline, --synthesize explicitly calls free Microsoft TTS."""
import argparse,asyncio,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'python'))
from radar_video.episode import prepare
from radar_video.render import render,synth
from radar_video.quality import verify_package
p=argparse.ArgumentParser();p.add_argument('--input',required=True,type=Path);p.add_argument('--output',required=True,type=Path);p.add_argument('--synthesize',action='store_true');p.add_argument('--render',action='store_true');p.add_argument('--verify-only',action='store_true');args=p.parse_args()
repo=Path(__file__).resolve().parents[2]
if args.output.resolve().is_relative_to(repo):p.error('Output must be outside Git source')
data=json.loads(args.input.read_text())
if args.verify_only:
 print(json.dumps(verify_package(args.output)));sys.exit(0)
manifests=prepare(data,args.output)
for m in manifests:
 if args.synthesize:asyncio.run(synth(m))
 if args.render:render(m)
if args.render:verify_package(args.output)
print(json.dumps({'status':'prepared' if not args.render else 'quality_verified','manifests':[str(x) for x in manifests],'platformOperations':False}))
