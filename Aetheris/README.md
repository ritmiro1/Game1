# AETHERIS 1.1.0 — lighting, shadow, water and AA iteration

Original GLSL 1.20 Minecraft Java shader pack, not a mod or resource pack.
**Intended loaders:** Iris/Fabric 1.21.4 first, OptiFine 1.21.4 second.
**Status: experimental; the build environment has no Minecraft installation or GPU
runtime. Static compilation is not proof of loader compatibility or visual quality.**
The current visual design is Overworld-focused; Nether/End behavior remains unverified.

## Install / update
Remove the old Aetheris ZIP from `.minecraft/shaderpacks/`, place
`Aetheris_v1.1.0.zip` there unopened, select it in Video Settings → Shaders /
Shader Packs, and reset old shader settings before selecting MEDIUM.
The install ZIP has `shaders/` directly at its root; the SOURCE ZIP is not installable.
Start with TAA, DOF and motion blur OFF. Test these separately after a baseline works.

## This iteration, in the requested order
1. **Compatibility safeguards:** guarded format constants in the shipped shader,
   no test-injected symbols, include/pair/setting/slider audits, a negative regression
   for the original RGBA16F failure, and source-hash-gated deterministic packaging.
   An automated workflow also compiles an extracted ZIP. This is static testing;
   real Iris/OptiFine/GPU compatibility is still an open runtime acceptance gate.
2. **Lighting:** camera-independent solar elevation; gentler sun/moon handover;
   moon-phase light strength, reduced cave light floor, sky-gated ground bounce,
   rain attenuation, roughness/normal safety, and optional eye-brightness-based
   exposure adaptation. Exposure uses the loader's smoothed eye light, not actual
   frame-luminance metering or a photographic autoexposure algorithm.
3. **Shadows:** slope- and resolution-aware receiver bias, bounded blocker search
   and PCSS-style contact-hardening penumbrae, 4/8/16 PCF taps. Light shafts use
   cheap single-tap shadows instead of nesting PCSS in every marching step.
   No claim of fully stabilized shadow maps or screen-space contact shadows yet.
5. **Water:** analytic wave gradients, distance-faded fine waves, front/back-facing
   normals, correct air/water Fresnel and total internal reflection, depth-rejected
   refraction, absorption controls, camera-to-interface underwater attenuation once,
   and SSR hit refinement with indoor-safe sky fallback. LOW retains depth absorption
   and refraction even when SSR is disabled. Single depth layers still limit complex
   overlapping transparency and off-screen reflection accuracy.
9. **Image stability:** HDR-aware bounded spatial AA; optional **experimental TAA**
   with eight-position projection jitter, matching depth reconstruction, previous-
   camera reprojection, depth rejection and YCoCg neighborhood clipping. History
   metadata rejects stale frames, resizes and toggles. Water/hand history is rejected;
   animated foliage/entities lack per-object motion vectors and may still ghost.
   TAA is OFF by default on every profile pending in-game validation. DOF and motion
   blur remain optional; camera blur excludes projection jitter and hand pixels.

## Other existing features
Material-ID GGX/Smith/Schlick PBR, HDR lighting, propagated vanilla block light and
camera-local held light, emissive blocks, AO, procedural sky/sun/phase-masked moon,
stars/Milky Way approximation, shaded vanilla clouds and approximate cloud shadows,
wet-surface reflections, separable bright-pass bloom, ACES-style tone mapping,
color grading, saturation, dither, vignette and subtle foliage wind.

## Profiles and settings
| Profile | Shadow map | PCF | Blocker search | AO | SSR steps | Shaft steps |
|---|---:|---:|---:|---:|---:|---:|
| LOW | 1024 | 4 | off | 4 | off | off |
| MEDIUM | 2048 | 8 | 4 | 8 | 8 | 4 |
| HIGH | 2048 | 8 | 4 | 16 | 16 | 8 |
| ULTRA | 4096 | 16 | 8 | 16 | 32 | 16 |

Shadow map size is manually selectable up to 8192 (costly); PCSS softness, water
absorption/refraction, night brightness, exposure and TAA history weight are exposed.
Defaults are between MEDIUM/HIGH until a profile is selected. Individual settings
can override a profile. TAA adds a persistent full-resolution RGBA16F attachment
and a resolve pass; actual GPU costs have not been benchmarked. Set vanilla clouds
Fancy; CLOUD_QUALITY changes shading detail, not volumetric cloud density.

## Not implemented / not certified
No PTGI, POM, texture-driven LabPBR, volumetric clouds, hierarchical-depth SSR,
colored transparent shadows, colored point-light propagation, caustics, foam, lens
flare, HBAO, dedicated lightning/snow accumulation, or verified cross-dimension
art direction. TAA has no dynamic-object motion vectors. No SEUS/BSL-level quality
or FPS claim. Read `RUNTIME_TESTS.md` for the uncompleted runtime checks.

## Performance guidance (unbenchmarked)
Start LOW/MEDIUM and increase quality after testing at your own resolution/render
distance. Previous hardware suggestions (GTX 1060/RX 580 for MEDIUM;
RTX 3060/RX 6700 XT for ULTRA, 8 GB RAM) are goals, not verified requirements.

## License
MIT; see LICENSE.txt. Original code, no third-party shader sources.
