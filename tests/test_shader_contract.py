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
from validate import SHADERS, apply_options, audit, expand, source_digest
from package import require_validation


class ShaderContractTests(unittest.TestCase):
    def test_loader_contract(self):
        self.assertEqual(len(audit()), 21)

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

    def test_rgba16f_missing_definition_regression(self):
        text = expand(SHADERS / 'deferred.fsh')
        fixed = self.compile_fragment(text)
        self.assertEqual(fixed.returncode, 0, fixed.stdout + fixed.stderr)
        broken = self.compile_fragment(text.replace('#define RGBA16F 0x881A', ''))
        self.assertNotEqual(broken.returncode, 0)
        self.assertIn('RGBA16F', broken.stdout + broken.stderr)


if __name__ == '__main__':
    unittest.main()
