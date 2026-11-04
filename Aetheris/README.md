# AETHERIS 1.0.1
### Original cinematic Minecraft shader pack · GLSL 1.20

**Target:** Minecraft Java 1.21.4 with Iris (Fabric); secondary target OptiFine.
**Status:** experimental speed-build. All program pairs compile/link with the
Khronos reference GLSL compiler across all four profiles and camera-effect
variants. **Minecraft, Iris, and OptiFine are not installed in the build sandbox;
in-game loading, visuals, GPU compatibility, and frame rates are NOT verified.**
This is not a mod, resource pack, or datapack. No third-party shader source is used.

## Install
1. Install Minecraft Java 1.21.4 and a matching Iris + Fabric installation or OptiFine.
2. Put `Aetheris_v1.0.1.zip` in `.minecraft/shaderpacks/` without extracting it.
3. Launch the game and open Video Settings → Shader Packs / Shaders.
4. Select Aetheris, open Shader Pack Settings, and choose MEDIUM to start.

The install ZIP has `shaders/` directly at its root, the conventional layout
recognized by shader loaders. The source archive instead contains the named
`Aetheris/shaders/` directory plus development tools. Do not install the source ZIP.

## Implemented
- GGX / Smith / Schlick material-ID PBR, linear lighting, HDR intermediate buffers.
- Warm horizon sun, cool moonlight, skylight and propagated vanilla block light.
- Distorted 1024–8192 shadow maps, 4/8/16-tap soft PCF, distance fade.
- Animated water normals, depth absorption, screen-space refraction, Fresnel SSR
  with procedural sky fallback (MEDIUM and up).
- Rain wetness darkening and smooth-surface reflections; shaded rain/snow particles.
- 4/8/16-sample view-space AO; shadow-map-marched light shafts.
- Day/dusk/night atmosphere approximation, procedural sun, phase-masked moon,
  stars and a subtle Milky Way band.
- Shaded vanilla cloud geometry, optional procedural cloud shading detail;
  approximate procedural cloud shadows, not exact matching cloud geometry.
- Emissive block material mapping; bloom using separable bright-pass filtering.
- ACES-style tone mapping, exposure, saturation, three grading presets, vignette,
  dither, edge-directed FXAA-style filtering; optional center-focus DOF and
  camera-reprojection motion blur.
- Subtle foliage wind with matching displacement in the shadow pass.

## Profiles
| Profile | Shadow map | PCF | AO | SSR steps | Light shaft steps |
|---|---:|---:|---:|---:|---:|
| LOW | 1024 | 4 | 4 | off | off |
| MEDIUM | 2048 | 8 | 8 | 8 | 4 |
| HIGH (default-equivalent) | 2048 | 8 | 16 | 16 | 8 |
| ULTRA | 4096 | 16 | 16 | 32 | 16 |

Individual sliders override profile defaults. Defaults use 8 AO samples until
HIGH is explicitly selected. DOF and motion blur default off. CLOUD_QUALITY controls
vanilla cloud shading, NOT volumetric cloud density. Set vanilla clouds to Fancy.

## Deliberate limitations
This ten-minute prototype does **not** offer PTGI/path tracing, POM, texture-driven
LabPBR maps, volumetric clouds, colored transparent shadows, dynamic colored
point lights, caustics, foam, lens flare, HBAO, accumulation TAA, exact blackbody
color temperatures, or a dedicated snow accumulation / lightning system.
ULTRA increases existing sampling budgets; it does not enable absent algorithms.
Emissives bloom, while nearby light uses Minecraft's existing light propagation.
The atmosphere is an artistic scattering approximation, not a physical integrator.
Screen-space reflections cannot reflect off-screen/occluded objects; depth-based
water uses only the nearest visible layer. Transparent materials, dimensions,
underwater transitions, stars, and loader-specific attachment blending need
in-game validation. Metal classification is intentionally heuristic.

## Suggested hardware (unbenchmarked)
MEDIUM: GTX 1060 / RX 580 or better. ULTRA: RTX 3060 / RX 6700 XT or better.
8 GB system RAM minimum suggested. Actual performance depends on resolution,
render distance, drivers and loader; no FPS claims. Try LOW if performance suffers.

## Runtime smoke test still required
Use an Overworld world with a lake, forest, cave, emissive blocks and stained glass.
Check noon, sunset, midnight, rain/snow; test above/below water and first-person
hand; test all profiles and toggle camera effects. Check Iris/OptiFine logs for
loader-specific warnings, verify shadows track geometry, compare settings, and
inspect water blend order. No rendered screenshots are supplied as proof.

## License
MIT; see LICENSE.txt.
