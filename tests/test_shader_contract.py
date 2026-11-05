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
from validate import SHADERS, apply_options, audit, expand, source_digest, resolve_properties, audit_preprocessed_formats
from package import require_validation


class ShaderContractTests(unittest.TestCase):
    def test_loader_contract(self):
        self.assertEqual(len(audit()), 90)

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
        self.assertIn('marchClouds(', expand(SHADERS / 'composite1.fsh'))
        self.assertIn('colortex4', expand(SHADERS / 'composite2.fsh'))
        self.assertIn('resolveTemporal(', expand(SHADERS / 'composite3.fsh'))
        self.assertIn('bright(', expand(SHADERS / 'composite4.fsh'))
        self.assertIn('bloomBlur(', expand(SHADERS / 'composite5.fsh'))

    def test_dimension_entry_points_synced(self):
        from sync_dimensions import sync
        sync(check=True)
        for world, macro in [('world-1','AETHER_NETHER'),('world1','AETHER_END')]:
            self.assertEqual(len(list((SHADERS/world).glob('*.vsh'))),30)
            self.assertIn('#define '+macro, (SHADERS/world/'final.fsh').read_text())
            self.assertIn('return 0.0;', expand(SHADERS/world/'final.fsh'))
        props=resolve_properties({'CLOUD_MODE':'2','COLORED_SHADOWS':'1'})
        for world in ['world-1','world1']:
            for name in ['shadow','composite1','composite2']:
                self.assertEqual(props[f'program.{world}/{name}.enabled'],'false')

    def test_indirect_and_hiz_pass_gates(self):
        disabled=resolve_properties({})
        for i in range(1,8):self.assertEqual(disabled[f'program.deferred{i}.enabled'],'false')
        enabled=resolve_properties({'SSGI':'1','HIZ_SSR':'1'})
        for i in range(1,8):self.assertNotIn(f'program.deferred{i}.enabled',enabled)
        self.assertEqual(resolve_properties({'SSGI':'1','GI_TEMPORAL':'0'})['program.deferred6.enabled'],'false')

    def test_motion_tracks_foliage_not_unknown_entity_animation(self):
        v=expand(SHADERS/'gbuffers_terrain.vsh')
        self.assertIn('frameTimeCounter-frameTime',v)
        f=expand(SHADERS/'gbuffers_entities.fsh')
        self.assertIn('Unknown animation: reject history',f)
        self.assertIn('previousClip.w',f)
        t=(SHADERS/'lib/temporal.glsl').read_text()
        self.assertIn('previousUV=uv+motionData.xy',t)
        self.assertIn('expected=motionData.z',t)

    def test_hierarchy_samples_exact_texel_centers(self):
        self.assertIn('floor(uv*size)',(SHADERS/'lib/hiz.glsl').read_text())
        for i in range(1,5):
            text=expand(SHADERS/f'deferred{i}.fsh')
            self.assertIn('floor(t*parentSize)',text)
            self.assertIn('nearestDepth=min(nearestDepth,z)',text)

    def test_gi_never_upsamples_the_reserved_history_texel(self):
        self.assertIn('if(t.y<1.0/size.y&&t.x<2.0/size.x)continue',expand(SHADERS/'deferred7.fsh'))
        self.assertIn('meta.a== -dimensionTag()',expand(SHADERS/'deferred6.fsh'))

    def test_tinted_shadow_uses_two_depth_maps(self):
        s=(SHADERS/'lib/shadows.glsl').read_text()
        for name in ['shadowtex0','shadowtex1','shadowcolor0']:self.assertIn(name,s)
        self.assertIn('material==10030.0',expand(SHADERS/'shadow.fsh'))
        self.assertIn('COLORED_LIGHTS.comment=Screen-space', (SHADERS/'lang/en_US.lang').read_text())

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
        self.assertIn('const int RGBA16F = 0x881A;', text)
        self.assertEqual(apply_options(text, {}), text)
        self.assertIn('const int colortex6Format = RGBA16F;', text)
        self.assertIn('const bool colortex6Clear = false;', text)

    def test_reflection_environment_excludes_point_stars_but_direct_sky_keeps_them(self):
        sky=(SHADERS/'lib/sky.glsl').read_text()
        self.assertIn('reflectionSky(vec3 ray){return skyRadiance(ray,false,false);}',sky)
        self.assertIn('renderSky(vec3 ray){return skyRadiance(ray,true,true);}',sky)
        self.assertIn('if(pointStars)star=',sky) # End
        self.assertIn('if(pointStars)stars=',sky) # Overworld
        self.assertIn('cloudSkyFallback(reflectionSky(rayW),rayW)',(SHADERS/'program/composite.fsh').read_text())

    def test_ssr_background_is_star_free_and_gi_does_not_restore_stars(self):
        deferred=(SHADERS/'program/deferred.fsh').read_text()
        self.assertIn('if(d>=0.99999)',deferred)
        self.assertIn('reflectionSource=reflectionSky(ray)',deferred)
        self.assertIn('gl_FragData[0]=vec4(c,1)',deferred) # actual visible sky unchanged
        gi=(SHADERS/'program/deferred7.fsh').read_text()
        self.assertIn('if(depth>=0.99999 || savedSource.a<=0.0)reflectionSource=savedSource.rgb;',gi)
        self.assertIn('gl_FragData[1]=vec4(reflectionSource,savedSource.a)',gi)

    def test_ssr_source_depth_and_hand_holes_survive_gi(self):
        source=(SHADERS/'program/deferred.fsh').read_text()
        self.assertIn('marker> -1.5 && marker< -0.5',source)
        self.assertIn('else reflectionSource=vec3(0.0)',source)
        self.assertIn('vec4(reflectionSource,sourceDepth)',source)
        gi=(SHADERS/'program/deferred7.fsh').read_text()
        self.assertIn('vec4(reflectionSource,savedSource.a)',gi)
        ssr=(SHADERS/'lib/reflections.glsl').read_text()
        self.assertNotIn('texture2D(depthtex1',ssr)
        self.assertIn('sourceDepth=reflectionTexel(t).a',ssr)
        self.assertIn('residual<tolerance',ssr)
        self.assertIn('value.a>0.0',ssr)
        self.assertIn('floor(uv*size)',ssr) # never interpolate categorical validity/depth

    def test_weather_only_writes_color_and_never_depth_or_material(self):
        weather=expand(SHADERS/'gbuffers_weather.fsh')
        self.assertIn('/* DRAWBUFFERS:0 */',weather)
        self.assertNotIn('gl_FragData[1]',weather)
        self.assertNotIn('gl_FragData[2]',weather)
        self.assertIn('luminance',weather)
        self.assertIn('RAIN_OPACITY',weather)
        self.assertEqual(resolve_properties({})['rain.depth'],'false')

    def test_sheet_cloud_profiles_disable_vanilla_and_volume_passes(self):
        from validate import variants
        for name in ['LOW','MEDIUM','HIGH']:
            options=variants()[name]
            self.assertEqual(options['CLOUD_MODE'],'3')
            props=resolve_properties(options)
            self.assertEqual(props['clouds'],'off')
            self.assertEqual(props['program.composite1.enabled'],'false')
        self.assertIn('return sheetCloudSky(c,ray)',(SHADERS/'lib/sky.glsl').read_text())
        self.assertIn('upperSheetOptical', (SHADERS/'lib/clouds.glsl').read_text())

    def test_weather_hides_celestials_and_gates_haze_to_outdoors(self):
        common=(SHADERS/'lib/common.glsl').read_text()
        self.assertIn('pow(1.0-weatherAmount(),4.0)',common)
        sky=(SHADERS/'lib/sky.glsl').read_text()
        self.assertIn('*day*celestial',sky)
        self.assertIn('*lit*(1.0-day)*celestial',sky)
        self.assertIn('(1.0-day)*celestial*smoothstep',sky)
        fog=(SHADERS/'lib/fog.glsl').read_text()
        self.assertIn('outdoorAccess(skyLight)*outdoorAccess(float(eyeBrightnessSmooth.y)/240.0)',fog)

    def test_material_f0_is_available_without_labpbr_and_glass_is_not_water(self):
        geom=(SHADERS/'lib/geometry.fsh').read_text()
        self.assertIn('material==10021.0',geom)
        self.assertIn('material==10022.0',geom)
        self.assertIn('water+glass*2.0',geom)
        self.assertIn('gl_FragData[3]=vec4(clamp(f0',geom)
        composite=(SHADERS/'program/composite.fsh').read_text()
        self.assertIn('bool water=material.g>0.5 && material.g<1.5',composite)
        self.assertNotIn('vec3(0.65)',composite)
        self.assertIn('surfaceF0=texture2D(colortex7,uv)',composite)
        self.assertEqual(resolve_properties({'LAB_PBR':'0'})['blend.gbuffers_water.colortex7'],'off')

    def test_weather_and_tonemap_reference_bounds(self):
        weights=[(1-r)**4 for r in [0,.25,.5,.75,1]]
        self.assertEqual(weights[0],1);self.assertEqual(weights[-1],0)
        self.assertEqual(weights,sorted(weights,reverse=True))
        # Sealed receiver or sealed eye suppresses the storm component independently.
        for eye,surface in [(0,0),(0,1),(1,0)]:self.assertEqual(eye*surface,0)
        def aces(x):return max(0,min(1,x*(2.51*x+.03)/(x*(2.43*x+.59)+.14)))
        for rgb in [(0,0,0),(.001,.002,.003),(1,.5,.02),(40,10,1),(1000,1000,1000)]:
            l=sum(x*w for x,w in zip(rgb,[.2126,.7152,.0722]))
            chroma=[x*aces(l)/max(l,.000001) for x in rgb]
            peak=max(1,max(chroma));mapped=[.65*aces(x)+.35*c/peak for x,c in zip(rgb,chroma)]
            self.assertTrue(all(math.isfinite(x) and 0<=x<=1 for x in mapped))

    def test_water_still_composited_without_ssr(self):
        text = (SHADERS / 'program/composite.fsh').read_text()
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
        for guard in ['meta.a== -dimensionTag()', 'meta.x*16.0+extra.y-viewWidth', 'meta.y*16.0+extra.z-viewHeight',
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

    def test_half_float_viewport_metadata_handles_large_odd_sizes(self):
        import struct
        half=lambda x:struct.unpack('e',struct.pack('e',x))[0]
        for size in [319,1081,1919,2561,3839,5119,8191,16383,32767]:
            self.assertEqual(half(size//16)*16+half(size%16),size)

    def test_split_frame_counter_cannot_reuse_modulo_only_history(self):
        for frame in [3,1023,1024,65535,720719]:
            low=(frame-1)%1024;upper=(frame-1)//1024
            self.assertEqual(upper*1024+low,frame-1)
            stale=frame-1-1024
            if stale>=0:self.assertNotEqual(stale//1024,upper)
        self.assertIn('extra.x-floor(float(frameCounter-1)/1024.0)',(SHADERS/'lib/temporal.glsl').read_text())

    def test_projective_cell_exit_reference(self):
        # q=(0,0,-2), ray=(0.5,0,-0.5), desired x/w=0.1.
        c_x,c_w,d_x,d_w,boundary=0.0,2.0,0.5,0.5,0.1
        t=(boundary*c_w-c_x)/(d_x-boundary*d_w)
        self.assertGreater(t,0)
        self.assertAlmostEqual((c_x+d_x*t)/(c_w+d_w*t),boundary)

    def test_depth_minimum_reduction_conservative(self):
        values=[40.0,2.0,30.0,8.0,80.0,1.0,60.0]
        for left in range(0,len(values)-1,2):
            reduced=min(values[max(0,left):min(len(values),left+3)])
            self.assertLessEqual(reduced,min(values[left:left+2]))

    def test_colored_transmission_finite_bounded(self):
        for value in [0.0,0.02,0.5,1.0]:
            trans=math.exp(-(1.0-value**2.2)*0.75*3.0)
            self.assertTrue(0.0<trans<=1.0)
        self.assertAlmostEqual(math.exp(-(1.0-1.0)*3),1.0)

    def test_water_footprint_filter_is_bounded_and_removes_subpixel_waves(self):
        weights=[math.exp(-0.5*f*f) for f in [0,.25,1,2,4,8]]
        self.assertEqual(weights[0],1)
        self.assertTrue(all(0<=w<=1 for w in weights))
        self.assertEqual(weights,sorted(weights,reverse=True))
        self.assertLess(weights[-1],1e-12)
        water=(SHADERS/'lib/water.glsl').read_text()
        self.assertIn('dot(gradient,dx)',water);self.assertIn('dot(gradient,dy)',water)
        self.assertNotIn('dFdx(',water) # library is also legal in vertex stages

    def test_water_wavevectors_are_continuous_across_world_wrap(self):
        for k in [.8*1.12,-.4*2.03,.95*3.9]:
            q=math.floor(k*4096/(2*math.pi)+.5)*2*math.pi/4096
            self.assertAlmostEqual(math.sin(q*13.27),math.sin(q*(13.27+4096)),places=10)

    def test_cave_readability_has_zero_option_and_gentler_light_falloff(self):
        lighting=(SHADERS/'lib/lighting.glsl').read_text()
        self.assertIn('*CAVE_BRIGHTNESS*(1.0-sky)',lighting)
        self.assertIn('1.65)',lighting)
        self.assertGreater(.25**1.65,.25**3*4)

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

    def preprocess(self,text):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'formats.frag';path.write_text(text)
            result=subprocess.run([COMPILER,'-E','-S','frag',str(path)],text=True,capture_output=True,timeout=30)
            self.assertEqual(result.returncode,0,result.stderr)
            return result.stdout

    def test_formats_survive_real_preprocessor_as_loader_symbols(self):
        source=apply_options(expand(SHADERS/'deferred.fsh'),{'HIZ_SSR':'1','SSGI':'1','LAB_PBR':'1'})
        formats=audit_preprocessed_formats(self.preprocess(source))
        self.assertEqual(formats['0'],'RGBA16F');self.assertEqual(formats['9'],'R32F')
        self.assertEqual(formats['15'],'RGBA8')
        # Original bug compiles successfully, but Iris cannot parse numeric format names.
        broken=source.replace('const int RGBA16F = 0x881A;','#define RGBA16F 0x881A')
        self.assertEqual(self.compile_fragment(broken).returncode,0)
        with self.assertRaises(ValueError):audit_preprocessed_formats(self.preprocess(broken))

    def test_labpbr_gradient_extension_fallback(self):
        text = apply_options(expand(SHADERS / 'gbuffers_terrain.fsh'), {'LAB_PBR': '1', 'POM': '1'})
        for source in [text, text.replace('GL_ARB_shader_texture_lod', 'AETHER_UNAVAILABLE_EXTENSION')]:
            result = self.compile_fragment(source)
            self.assertEqual(result.returncode, 0, result.stdout+result.stderr)

    def test_rgba16f_missing_definition_regression(self):
        text = expand(SHADERS / 'deferred.fsh')
        fixed = self.compile_fragment(text)
        self.assertEqual(fixed.returncode, 0, fixed.stdout + fixed.stderr)
        broken = self.compile_fragment(text.replace('const int RGBA16F = 0x881A;', ''))
        self.assertNotEqual(broken.returncode, 0)
        self.assertIn('RGBA16F', broken.stdout + broken.stderr)


if __name__ == '__main__':
    unittest.main()
