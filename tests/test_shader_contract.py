"""CPU and static regressions. No claim of exercising a Minecraft render pipeline."""
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from validate import SHADERS, apply_options, audit, expand, source_digest, resolve_properties
from package import require_validation


class ShaderContractTests(unittest.TestCase):
    def test_loader_contract(self):
        self.assertEqual(len(audit()), 23)

    def test_disabled_passes_and_shared_effect_sizes(self):
        defaults = resolve_properties({})
        self.assertEqual(defaults['program.composite3.enabled'], 'false')
        self.assertEqual(defaults['program.composite1.enabled'], 'false')
        self.assertEqual(defaults['size.buffer.colortex4'], '0.5 0.5')
        for scale, expected in [('0', '0.25 0.25'), ('1', '0.5 0.5'), ('2', '1.0 1.0')]:
            props = resolve_properties({'EFFECT_RESOLUTION': scale, 'BLOOM_ENABLED': '0'})
            self.assertEqual(props['size.buffer.colortex4'], expected)
            self.assertEqual(props['size.buffer.colortex5'], expected)
            self.assertEqual(props['program.composite4.enabled'], 'false')
            self.assertEqual(props['program.composite5.enabled'], 'false')
        props = resolve_properties({'TAA': '1', 'CLOUD_MODE': '2'})
        for i in [1, 2, 3]:
            self.assertNotIn(f'program.composite{i}.enabled', props)
        self.assertEqual(props['clouds'], 'off')
        no_clouds = resolve_properties({'CLOUD_MODE': '2', 'CLOUD_QUALITY': '0'})
        self.assertEqual(no_clouds['program.composite1.enabled'], 'false')
        self.assertEqual(no_clouds['program.composite2.enabled'], 'false')

    def test_bloom_bandwidth_estimate_not_fps(self):
        from performance_budget import estimate
        half = estimate({})
        self.assertEqual(half['bloom_filter_texture_reads_upper_bound'], 960*540*14)
        self.assertLess(half['bloom_filter_texture_reads_upper_bound'], half['old_full_resolution_9_plus_9_read_reference'])
        self.assertEqual(estimate({'BLOOM_ENABLED': '0'})['bloom_filter_texture_reads_upper_bound'], 0)
        self.assertEqual(estimate({}, 1919, 1079)['effect_buffer'], [959, 539])

    def test_material_footprint_evaluated_before_parallax(self):
        text = (SHADERS / 'lib/geometry.fsh').read_text()
        self.assertLess(text.index('gradX=dFdx(uv)'), text.index('parallaxUV('))
        material = (SHADERS / 'lib/materials.glsl').read_text()
        self.assertIn('clamp(texcoord+shift*layer,lo,hi)', material)
        self.assertIn('if(alpha<255.0)', material)
        self.assertIn('texture2DGradARB', material)

    def test_no_sunlight_when_skipping_dark_cave_shadows(self):
        text = (SHADERS / 'lib/lighting.glsl').read_text()
        self.assertIn('skyAccess=smoothstep(0.02,0.10,lm.y)', text)
        self.assertIn('*visibility*skyAccess', text)

    def test_cloud_buffer_reused_before_bloom(self):
        self.assertIn('marchClouds(', (SHADERS / 'composite1.fsh').read_text())
        self.assertIn('colortex4', (SHADERS / 'composite2.fsh').read_text())
        self.assertIn('resolveTemporal(', (SHADERS / 'composite3.fsh').read_text())
        self.assertIn('bright(', (SHADERS / 'composite4.fsh').read_text())
        self.assertIn('bloomBlur(', (SHADERS / 'composite5.fsh').read_text())

    def test_loader_uniform_types(self):
        text = (SHADERS / 'lib/common.glsl').read_text()
        self.assertIn('uniform ivec2 eyeBrightnessSmooth;', text)
        self.assertIn('uniform int frameCounter;', text)
        self.assertIn('uniform int heldBlockLightValue, heldBlockLightValue2;', text)

    def test_all_geometry_jittered_but_not_shadows(self):
        for path in SHADERS.glob('gbuffers_*.vsh'):
            with self.subTest(program=path.stem):
                self.assertIn('gl_Position=jitterClip(', expand(path))
        self.assertNotIn('gl_Position=jitterClip(', expand(SHADERS / 'shadow.vsh'))

    def test_format_enum_shipped_not_injected(self):
        text = expand(SHADERS / 'deferred.fsh')
        self.assertIn('#define RGBA16F 0x881A', text)
        self.assertEqual(apply_options(text, {}), text)
        self.assertIn('const int colortex6Format = RGBA16F;', text)
        self.assertIn('const bool colortex6Clear = false;', text)

    def test_water_still_composited_without_ssr(self):
        text = (SHADERS / 'composite.fsh').read_text()
        self.assertNotIn('#if REFLECTION_STEPS', text)
        self.assertIn('waterFresnel(', text)
        self.assertIn('waterTransmission(', text)

    def test_every_ui_option_has_an_english_label(self):
        props = (SHADERS / 'shaders.properties').read_text()
        language = (SHADERS / 'lang/en_US.lang').read_text()
        import re
        for line in re.findall(r'^screen\.\w+=(.*)', props, re.M):
            for option in line.split():
                self.assertIn('option.' + option + '=', language)

    def test_stale_validation_rejected(self):
        report = {'passed': True, 'errors': [], 'compiler_macros_injected': False,
                  'source_sha256': source_digest()}
        require_validation(report)
        for field, value in [('source_sha256', 'stale'), ('passed', False),
                              ('compiler_macros_injected', True), ('errors', ['error'])]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                require_validation({**report, field: value})

    def test_include_escape_and_cycle_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            p = root / 'test.glsl'
            p.write_text('#include "/../escape.glsl"\n')
            with self.assertRaises(ValueError):
                expand(p, root=root)
            p.write_text('#include "/test.glsl"\n')
            with self.assertRaises(ValueError):
                expand(p, root=root)

    def test_temporal_history_has_freshness_and_depth_checks(self):
        text = (SHADERS / 'lib/temporal.glsl').read_text()
        for guard in ['meta.a== -1.0', 'meta.x-viewWidth', 'meta.y-viewHeight',
                      'frameCounter-1', 'history.a-expected', 'material.g>0.5', 'material.a< -0.5']:
            self.assertIn(guard, text)


class NumericTests(unittest.TestCase):
    @staticmethod
    def fresnel(cosine, underwater=False):
        eta = 1.333 if underwater else 1.0 / 1.333
        sine2 = eta * eta * max(0, 1 - cosine * cosine)
        if sine2 >= 1:
            return 1.0
        ct = math.sqrt(max(0, 1 - sine2))
        rs = (eta * cosine - ct) / max(eta * cosine + ct, 1e-5)
        rp = (cosine - eta * ct) / max(cosine + eta * ct, 1e-5)
        return (rs * rs + rp * rp) * 0.5

    def test_water_normal_incidence_and_internal_reflection(self):
        self.assertAlmostEqual(self.fresnel(1), 0.020373, places=5)
        self.assertAlmostEqual(self.fresnel(1), self.fresnel(1, True), places=8)
        self.assertEqual(self.fresnel(0.5, True), 1.0)
        for underwater in [False, True]:
            for i in range(101):
                f = self.fresnel(i / 100.0, underwater)
                self.assertTrue(math.isfinite(f) and 0 <= f <= 1)

    def test_absorption_monotonic_and_color_order(self):
        for density in [0.5, 0.75, 1.0, 1.5, 2.0]:
            previous = [1.0] * 3
            for depth in [0, 0.1, 1, 4, 16, 64]:
                current = [math.exp(-k * depth * density) for k in [0.22, 0.065, 0.045]]
                self.assertTrue(all(0 <= c <= p for c, p in zip(current, previous)))
                self.assertLessEqual(current[0], current[1])
                self.assertLessEqual(current[1], current[2])
                previous = current

    def test_labpbr_channel_boundaries(self):
        for alpha in range(256):
            emission = alpha/254.0 if alpha < 255 else 0.0
            self.assertTrue(0.0 <= emission <= 1.0)
        self.assertEqual(254/254.0, 1.0)
        for smoothness in [0.0, 0.25, 0.5, 0.9, 1.0]:
            rough = max(0.08, 1.0-smoothness)
            self.assertTrue(0.006 <= rough*rough <= 1.0)

    def test_gaussian_pair_weights_normalized(self):
        self.assertAlmostEqual(0.2041637+2*0.3040054+2*0.0939128, 1.0, places=5)

    def test_height_fog_integral_is_positive_and_continuous(self):
        for x in [-12, -1, -0.001, 0, 0.001, 1, 12]:
            value = 1-x*0.5 if abs(x)<0.001 else (1-math.exp(-x))/x
            self.assertTrue(math.isfinite(value) and value>0)
        self.assertAlmostEqual((1-math.exp(-0.0001))/0.0001, 1-0.0001/2, places=7)

    def test_cloud_slab_interval(self):
        for camera_y, ray_y, expected in [(64, 1, (128, 192)), (300, -1, (44, 108)), (220, 1, (0, 36))]:
            a,b=(192-camera_y)/ray_y,(256-camera_y)/ray_y
            self.assertEqual((max(0, min(a,b)), max(a,b)), expected)

    def test_ycocg_roundtrip(self):
        for r, g, b in [(0, 0, 0), (0.1, 0.2, 0.3), (12, 0.1, 4), (1, 1, 1)]:
            y, co, cg = (r + 2*g + b)/4, (r-b)/2, (-r+2*g-b)/4
            for actual, expected in zip([y+co-cg, y+cg, y-co-cg], [r, g, b]):
                self.assertAlmostEqual(actual, expected)

    def test_projection_jitter_roundtrip(self):
        # Same mapping as jitterClip/projectView and viewPosition, across aspect ratios.
        for width, height in [(1280, 720), (1920, 1080), (3440, 1440), (1, 1)]:
            for jx, jy in [(0, 0), (-0.25, 1/6), (0.375, 1/18)]:
                for x, y, z in [(0.1, -0.3, -1), (2, 4, -20)]:
                    uvx = (x/-z)*0.5+0.5+jx/width
                    uvy = (y/-z)*0.5+0.5+jy/height
                    self.assertAlmostEqual((uvx-jx/width-0.5)*2*(-z), x)
                    self.assertAlmostEqual((uvy-jy/height-0.5)*2*(-z), y)


COMPILER = os.environ.get('GLSLANG_VALIDATOR') or shutil.which('glslangValidator')


@unittest.skipUnless(COMPILER, 'Set GLSLANG_VALIDATOR to run the compiler regression')
class CompilerRegressionTests(unittest.TestCase):
    def compile_fragment(self, text):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'regression.frag'
            path.write_text(text)
            return subprocess.run([COMPILER, '-S', 'frag', str(path)],
                                  text=True, capture_output=True, timeout=30)

    def test_labpbr_gradient_extension_fallback(self):
        text = apply_options(expand(SHADERS / 'gbuffers_terrain.fsh'), {'LAB_PBR': '1', 'POM': '1'})
        for source in [text, text.replace('GL_ARB_shader_texture_lod', 'AETHER_UNAVAILABLE_EXTENSION')]:
            result = self.compile_fragment(source)
            self.assertEqual(result.returncode, 0, result.stdout+result.stderr)

    def test_rgba16f_missing_definition_regression(self):
        text = expand(SHADERS / 'deferred.fsh')
        fixed = self.compile_fragment(text)
        self.assertEqual(fixed.returncode, 0, fixed.stdout + fixed.stderr)
        broken = self.compile_fragment(text.replace('#define RGBA16F 0x881A', ''))
        self.assertNotEqual(broken.returncode, 0)
        self.assertIn('RGBA16F', broken.stdout + broken.stderr)


if __name__ == '__main__':
    unittest.main()
