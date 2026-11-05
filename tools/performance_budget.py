#!/usr/bin/env python3
"""Analytic upper bounds for a few passes, NOT GPU timing or an FPS benchmark."""
import argparse
import json
from validate import default_options, resolve_properties, variants


def estimate(options, width=1920, height=1080):
    if width < 4 or height < 4:
        raise ValueError('Budget requires viewport dimensions >= 4')
    values = {**default_options(), **options}
    properties = resolve_properties(options)
    scale = float(properties['size.buffer.colortex4'].split()[0])
    pixels = int(width * scale) * int(height * scale)
    bloom = int(values['BLOOM_ENABLED']) == 1
    cloud = int(values['CLOUD_MODE']) == 2 and int(values['CLOUD_QUALITY']) > 0
    return {'viewport': [width, height], 'effect_buffer': [int(width*scale), int(height*scale)],
            'bloom_filter_texture_reads_upper_bound': pixels * 14 if bloom else 0,
            'old_full_resolution_9_plus_9_read_reference': width * height * 18,
            'cloud_primary_samples_upper_bound': pixels * int(values['CLOUD_STEPS']) * int(values['CLOUD_LAYERS']) if cloud else 0,
            'hiz_minimum_reduction_reads_upper_bound': sum(int(width*s)*int(height*s)*9 for s in [0.5,0.25,0.125,0.0625]) if int(values['HIZ_SSR']) else 0,
            'ssgi_candidate_rays_upper_bound': (width//2)*(height//2)*int(values['GI_SAMPLES']) if int(values['SSGI']) else 0,
            'colored_emitter_candidates_upper_bound': (width//2)*(height//2)*int(values['GI_SAMPLES']) if int(values['COLORED_LIGHTS']) else 0,
            'taa_resolve_enabled': int(values['TAA']) == 1,
            'single_rgba16f_effect_target_bytes': pixels * 8,
            'labpbr_extra_single_rgba8_target_bytes': width*height*4 if int(values['LAB_PBR']) else 0,
            'notes': 'Analytic only; not a total frame cost; ray counts exclude per-ray depth/lighting/occlusion reads, final upsample, overdraw, driver allocations and GPU timing.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--width', type=int, default=1920)
    parser.add_argument('--height', type=int, default=1080)
    args = parser.parse_args()
    print(json.dumps({p: estimate(o, args.width, args.height)
                      for p, o in variants().items()}, indent=2))


if __name__ == '__main__':
    main()
