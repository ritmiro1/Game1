#!/usr/bin/env python3
"""Deterministic packaging, gated by a successful report matching current sources."""
import hashlib
import json
import re
import zipfile
from pathlib import Path
from validate import ROOT, SHADERS, audit, source_digest


def archive(path, entries):
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, source in sorted(entries):
            if name.startswith('/') or '..' in Path(name).parts:
                raise ValueError(f'Unsafe archive path {name}')
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 4, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, source.read_bytes())
    with zipfile.ZipFile(path) as z:
        if z.testzip() is not None:
            raise ValueError('Archive integrity failure')
    return path


def require_validation(report, shader_root=SHADERS):
    if report.get('passed') is not True or report.get('errors'):
        raise ValueError('Compile/link validation must pass before packaging')
    if report.get('compiler_macros_injected') is not False:
        raise ValueError('Test-only macro injection is forbidden')
    if report.get('source_sha256') != source_digest(shader_root):
        raise ValueError('Validation report is stale: rerun tools/validate.py')


def main():
    out = ROOT / 'artifacts'
    out.mkdir(exist_ok=True)
    report_path = out / 'validation.json'
    if not report_path.exists():
        raise ValueError('Run tools/validate.py before packaging')
    report = json.loads(report_path.read_text())
    require_validation(report)
    audit()
    version = (ROOT / 'Aetheris/VERSION').read_text().strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid pack version')
    pack = ROOT / 'Aetheris'
    entries = [(p.relative_to(pack).as_posix(), p) for p in pack.rglob('*') if p.is_file()]
    install = archive(out / f'Aetheris_v{version}.zip', entries)
    with zipfile.ZipFile(install) as z:
        if 'shaders/shaders.properties' not in z.namelist():
            raise ValueError('Missing root shaders directory')
        for source in SHADERS.rglob('*'):
            if source.is_file() and z.read(source.relative_to(pack).as_posix()) != source.read_bytes():
                raise ValueError(f'Archive/source mismatch: {source}')
    source_entries = [(p.relative_to(ROOT).as_posix(), p)
                      for folder in ['Aetheris', 'tools', 'tests', '.github']
                      for p in (ROOT / folder).rglob('*')
                      if p.is_file() and '__pycache__' not in p.parts]
    source_entries.append(('README.md', ROOT / 'README.md'))
    # Include the exact report used to gate this archive, not an old test snapshot.
    source_entries.append(('validation.json', report_path))
    source = archive(out / f'Aetheris_v{version}_SOURCE.zip', source_entries)
    checks = ''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n'
                     for p in [install, source])
    (out / 'SHA256SUMS.txt').write_text(checks)
    for path in [install, source]:
        print(f'{path.name}: {path.stat().st_size:,} bytes')
    print(checks)


if __name__ == '__main__':
    main()
