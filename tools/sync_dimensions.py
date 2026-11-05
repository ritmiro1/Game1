#!/usr/bin/env python3
"""Generate tiny loader entry points from canonical shader program bodies."""
import argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
S=ROOT/'Aetheris/shaders'

def sync(check=False):
    errors=[]
    for body in sorted((S/'program').glob('*')):
        if body.suffix not in {'.vsh','.fsh'}:continue
        for folder,macro in [('',None),('world-1','AETHER_NETHER'),('world1','AETHER_END')]:
            path=S/folder/body.name
            text='#version 120\n'+(f'#define {macro}\n' if macro else '')+f'#include "/program/{body.name}"\n'
            if check:
                if not path.exists() or path.read_text()!=text:errors.append(str(path.relative_to(S)))
            else:
                path.parent.mkdir(exist_ok=True);path.write_text(text)
    if errors:raise ValueError('Stale dimension entry points: '+', '.join(errors))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');sync(p.parse_args().check)
