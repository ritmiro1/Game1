#!/usr/bin/env python3
"""Deterministic, dependency-free shader and source packaging with archive audits."""
import hashlib,json,re,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts';OUT.mkdir(exist_ok=True)
def archive(name,entries):
    path=OUT/name
    with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for arc,src in sorted(entries):
            info=zipfile.ZipInfo(arc,date_time=(2026,11,4,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
            z.writestr(info,src.read_bytes())
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        assert all(not n.startswith('/') and '..' not in Path(n).parts for n in z.namelist())
    return path
pack=ROOT/'Aetheris'
install=archive('Aetheris_v1.0.1.zip',[(str(p.relative_to(pack)),p) for p in pack.rglob('*') if p.is_file()])
with zipfile.ZipFile(install) as z:
    names=set(z.namelist());assert 'shaders/shaders.properties' in names
    assert len([n for n in names if n.endswith('.vsh')])>=12
    for n in names:
        if n.endswith('.vsh'):assert n[:-4]+'.fsh' in names
        if n.endswith(('.vsh','.fsh','.glsl')):
            for inc in re.findall(r'#include\s+"([^"]+)"',z.read(n).decode()):
                target='shaders/'+inc.lstrip('/') if inc.startswith('/') else str(Path(n).parent/inc)
                assert target in names,(n,inc)
source_entries=[(str(p.relative_to(ROOT)),p) for d in ['Aetheris','tools','tests'] for p in (ROOT/d).rglob('*') if p.is_file() and '__pycache__' not in str(p)]
source_entries.append(('README.md',ROOT/'README.md'))
source=archive('Aetheris_SOURCE.zip',source_entries)
checks=''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in [install,source])
(OUT/'SHA256SUMS.txt').write_text(checks)
for p in [install,source]:print(f'{p.name}: {p.stat().st_size:,} bytes')
print(checks)
