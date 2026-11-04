#!/usr/bin/env python3
"""Static loader-contract audits and GLSL compile/link checks; not a Minecraft test."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHADERS = ROOT / 'Aetheris/shaders'


def source_digest(root=SHADERS):
    digest = hashlib.sha256()
    for path in sorted(p for p in root.rglob('*') if p.is_file()):
        digest.update(path.relative_to(root).as_posix().encode() + b'\0')
        digest.update(path.read_bytes() + b'\0')
    return digest.hexdigest()


def expand(path, stack=(), root=SHADERS):
    path, root = path.resolve(), root.resolve()
    if not path.is_relative_to(root):
        raise ValueError(f'Include escapes shader root: {path}')
    if path in stack:
        raise ValueError(f'Circular include: {path}')
    text = path.read_text()

    def include(match):
        name = match[1]
        child = root / name.lstrip('/') if name.startswith('/') else path.parent / name
        return expand(child, (*stack, path), root)

    return re.sub(r'^\s*#include\s+"([^"]+)"\s*$', include, text, flags=re.M)


def apply_options(text, options):
    # Only substitute user settings, never supply missing symbols or driver macros.
    for key, value in options.items():
        text = re.sub(r'(#define\s+' + re.escape(key) + r')\s+[^\s/]+',
                      lambda m: m[1] + ' ' + value, text)
        text = re.sub(r'(const\s+\w+\s+' + re.escape(key) + r'\s*=\s*)[^;]+',
                      lambda m: m[1] + value, text)
    return text


def default_options(root=SHADERS):
    text = (root / 'lib/settings.glsl').read_text()
    return dict(re.findall(r'^#define\s+(\w+)\s+([^\s/]+)\s*//\s*\[', text, re.M))


def resolve_properties(options, root=SHADERS):
    """Audit just the integer #if/elif subset used by THIS pack, not a loader emulator."""
    values = {**default_options(root), **options}
    result, stack, active = {}, [], True
    for line in (root / 'shaders.properties').read_text().splitlines():
        line = line.strip()
        condition = re.fullmatch(r'#(if|elif)\s+(\w+)\s*(==|!=)\s*(\d+)', line)
        if condition:
            kind, name, operator, number = condition.groups()
            if name not in values:
                raise ValueError(f'Unknown conditional property option: {name}')
            matches = (int(values[name]) == int(number)) == (operator == '==')
            if kind == 'if':
                stack.append([active, matches])
                active = active and matches
            else:
                parent, used = stack[-1]
                active = parent and not used and matches
                stack[-1][1] = used or matches
        elif line == '#else':
            parent, used = stack[-1]
            active = parent and not used
            stack[-1][1] = True
        elif line == '#endif':
            active = stack.pop()[0]
        elif line.startswith(('#if', '#elif', '#ifdef', '#ifndef')):
            raise ValueError('Unsupported conditional in property audit: ' + line)
        elif active and line and not line.startswith('#'):
            key, value = line.split('=', 1)
            result[key.strip()] = value.strip()
    if stack:
        raise ValueError('Unbalanced property directives')
    return result


def variants(root=SHADERS):
    settings = (root / 'shaders.properties').read_text()
    profiles = {key: dict(re.findall(r'(\w+)=([\w.]+)', value))
                for key, value in re.findall(r'^profile\.(\w+)=(.*)', settings, re.M)}
    profiles['DEFAULT'] = {}
    profiles['HIGH_CAMERA'] = {**profiles['HIGH'], 'DOF': '1', 'MOTION_BLUR': '1', 'COLOR_GRADE': '2'}
    profiles['NEUTRAL_DISABLED'] = {**profiles['LOW'], 'COLOR_GRADE': '0', 'FXAA': '0',
                                    'VIGNETTE': '0', 'CLOUD_QUALITY': '0', 'AUTO_EXPOSURE': '0'}
    profiles['TEMPORAL_HIGH'] = {**profiles['HIGH'], 'TAA': '1'}
    profiles['TEMPORAL_CAMERA'] = {**profiles['HIGH_CAMERA'], 'TAA': '1'}
    profiles['EXTREMES'] = {**profiles['ULTRA'], 'TAA': '1', 'TAA_HISTORY': '0.9',
                            'shadowMapResolution': '8192', 'shadowDistance': '192.0',
                            'WATER_ABSORPTION': '2.0', 'WATER_REFRACTION': '0.0',
                            'SHADOW_SOFTNESS': '2.0', 'NIGHT_BRIGHTNESS': '1.5'}
    profiles['LABPBR'] = {**profiles['HIGH'], 'LAB_PBR': '1'}
    profiles['LABPBR_POM'] = {**profiles['HIGH'], 'LAB_PBR': '1', 'POM': '1'}
    profiles['ALL_FEATURES'] = {**profiles['TEMPORAL_CAMERA'], 'LAB_PBR': '1', 'POM': '1',
                                'POM_STEPS': '20', 'POM_DEPTH': '0.06', 'CLOUD_MODE': '2',
                                'ATMOSPHERE_QUALITY': '2', 'EFFECT_RESOLUTION': '2'}
    profiles['FAST_DISABLED'] = {**profiles['LOW'], 'BLOOM_ENABLED': '0', 'CLOUD_MODE': '0',
                                 'AO_STRENGTH': '0.0', 'FOG_DENSITY': '0.0'}
    profiles['VOLUME_QUARTER'] = {**profiles['ULTRA'], 'EFFECT_RESOLUTION': '0', 'CLOUD_STEPS': '8'}
    return profiles


def audit(root=SHADERS):
    pairs = sorted(root.glob('*.vsh'))
    if len(pairs) < 12:
        raise ValueError('At least twelve program pairs are required')
    if {p.stem for p in pairs} != {p.stem for p in root.glob('*.fsh')}:
        raise ValueError('Orphan shader stage')
    for path in [*pairs, *root.glob('*.fsh')]:
        text = expand(path, root=root)
        if not text.startswith('#version 120\n') or len(re.findall(r'^\s*#version', text, re.M)) != 1:
            raise ValueError(f'Invalid or repeated GLSL version: {path.name}')
    properties = (root / 'shaders.properties').read_text()
    options = (root / 'lib/settings.glsl').read_text()
    declared = {}
    for line in options.splitlines():
        match = re.search(r'(?:#define\s+|const\s+\w+\s+)(\w+)\s*(?:=\s*)?([^\s;]+).*?//\s*\[([^]]+)\]', line)
        if match:
            declared[match[1]] = set(match[3].split())
            if match[2] not in declared[match[1]]:
                raise ValueError(f'Default outside option range: {match[1]}')
    for profile, values in variants(root).items():
        for key, value in values.items():
            if key not in declared or value not in declared[key]:
                raise ValueError(f'Unknown option/value {profile}: {key}={value}')
    for screen in re.findall(r'^screen(?:\.\w+)?=(.*)', properties, re.M):
        for item in screen.split():
            if not item.startswith(('[', '<')) and item != '*' and item not in declared:
                raise ValueError(f'Unknown screen option: {item}')
    sliders = re.search(r'^sliders=(.*)', properties, re.M)
    if sliders and set(sliders[1].split()) - declared.keys():
        raise ValueError('Unknown slider option')
    text = '\n'.join(p.read_text() for p in root.rglob('*') if p.is_file() and p.suffix in {'.glsl', '.vsh', '.fsh'})
    for key in declared:
        # Declaration plus at least one actual use (ignores profile/menu mentions).
        if len(re.findall(r'\b' + re.escape(key) + r'\b', text)) < 2 and key not in {
                'shadowMapResolution', 'shadowDistance'}:
            raise ValueError(f'Unused setting: {key}')
    return pairs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--compiler', required=True)
    parser.add_argument('--root', type=Path, default=SHADERS)
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/validation.json')
    args = parser.parse_args()
    root = args.root.resolve()
    pairs = audit(root)
    report = {'type': 'static GLSL compile/link and contract audit (not Minecraft runtime)',
              'compiler': subprocess.check_output([args.compiler, '--version'], text=True).splitlines()[0],
              'source_sha256': source_digest(root), 'compiler_macros_injected': False,
              'program_pairs': len(pairs), 'variants': {}, 'pipeline_contracts': {}, 'errors': []}
    with tempfile.TemporaryDirectory() as directory:
        for profile, options in variants(root).items():
            properties = resolve_properties(options, root)
            enabled = [p.stem for p in pairs if p.stem.startswith('composite')
                       and properties.get('program.' + p.stem + '.enabled', 'true') != 'false']
            report['pipeline_contracts'][profile] = {
                'enabled_composite_programs': enabled,
                'buffer4_scale': properties['size.buffer.colortex4'],
                'buffer5_scale': properties['size.buffer.colortex5'],
                'vanilla_clouds': properties['clouds']}
            for vertex in pairs:
                inputs = []
                for source, extension in [(vertex, 'vert'), (vertex.with_suffix('.fsh'), 'frag')]:
                    text = apply_options(expand(source, root=root), options)
                    target = Path(directory) / (vertex.stem + '.' + extension)
                    target.write_text(text)
                    inputs.append(str(target))
                result = subprocess.run([args.compiler, '-l', *inputs], text=True, capture_output=True, timeout=30)
                if result.returncode:
                    report['errors'].append({'profile': profile, 'program': vertex.stem,
                                             'log': result.stdout + result.stderr})
            report['variants'][profile] = len(pairs)
    report['passed'] = not report['errors']
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
