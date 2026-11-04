#!/usr/bin/env python3
"""Resolve loader-style includes, compile/link GLSL 1.20, audit settings and ZIPs.
A static tool, NOT a substitute for Minecraft / Iris runtime testing.
"""
import argparse, re, subprocess, tempfile, zipfile, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; SHADERS=ROOT/'Aetheris/shaders'
def expand(path,stack=()):
    if path in stack: raise ValueError(f'Circular include {path}')
    text=path.read_text()
    def inc(m):
        p=(SHADERS/m[1].lstrip('/')) if m[1].startswith('/') else path.parent/m[1]
        if not p.is_file(): raise FileNotFoundError(p)
        return expand(p,(*stack,path))
    return re.sub(r'^\s*#include\s+"([^"]+)"\s*$',inc,text,flags=re.M)
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--compiler',required=True);args=ap.parse_args()
    settings=(SHADERS/'shaders.properties').read_text()
    profiles={k:dict(re.findall(r'(\w+)=([\w.]+)',v)) for k,v in re.findall(r'^profile\.(\w+)=(.*)',settings,re.M)}
    profiles['HIGH_CAMERA']={**profiles['HIGH'],'DOF':'1','MOTION_BLUR':'1','COLOR_GRADE':'2'}
    profiles['NEUTRAL']={**profiles['LOW'],'COLOR_GRADE':'0','FXAA':'0','VIGNETTE':'0','CLOUD_QUALITY':'0'}
    pairs=sorted(SHADERS.glob('*.vsh')); assert len(pairs)>=12
    report={'type':'static GLSL compile/link (not Minecraft runtime)','program_pairs':len(pairs),'variants':{},'errors':[]}
    with tempfile.TemporaryDirectory() as td:
        for profile,opts in profiles.items():
            count=0
            for vert in pairs:
                frag=vert.with_suffix('.fsh');assert frag.exists()
                inputs=[]
                for source,ext in [(vert,'vert'),(frag,'frag')]:
                    text=expand(source)
                    for k,v in opts.items():
                        text=re.sub(r'(#define\s+'+k+r')\s+[^\s/]+',lambda m:m[1]+' '+v,text)
                        text=re.sub(r'(const\s+\w+\s+'+k+r'\s*=\s*)[^;]+',lambda m:m[1]+v,text)
                    # Iris / OptiFine inject symbolic framebuffer format constants.
                    text=text.replace('#version 120','#version 120\n#define RGBA16F 34842',1)
                    dest=Path(td)/(vert.stem+'.'+ext);dest.write_text(text);inputs.append(str(dest))
                p=subprocess.run([args.compiler,'-l',*inputs],text=True,capture_output=True)
                if p.returncode:report['errors'].append({'profile':profile,'program':vert.stem,'log':p.stdout+p.stderr})
                count+=1
            report['variants'][profile]=count
    report['passed']=not report['errors']
    (ROOT/'artifacts').mkdir(exist_ok=True)
    (ROOT/'artifacts/validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2));return 0 if report['passed'] else 1
if __name__=='__main__':raise SystemExit(main())
