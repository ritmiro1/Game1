# AETHERIS 1.4.0 — experimental advanced screen-space rendering

Original Minecraft shader pack, **not a mod/resource pack/datapack**.
Intended targets: Iris/Fabric 1.21.4, then OptiFine 1.21.4, modern desktop OpenGL.
GLSL 1.20 syntax with an optional guarded texture-gradient extension for LabPBR/POM.
**No Minecraft/GPU runtime is available here: compilation is NOT in-game certification.**

**Not all nine requested features are complete:** analytic motion tracks this pack's
foliage, not mob/bone animation; colored lighting is visible-emitter screen space,
NOT voxel light propagation; moving cloud fronts do NOT change Minecraft's actual
regional rain/snow. See [precise Russian feature status](FEATURE_STATUS.ru.md).

## 1.4.0: weather/material pass
**New defaults require reset + profile selection.** LOW/MEDIUM/HIGH use cloud mode
3 (soft world-anchored 2.5D sheet; MEDIUM/HIGH add upper wisps). ULTRA keeps volume
mode 2. Legacy Minecraft clouds remain mode 1 for compatibility, not the new default.
Heavy rain fades celestial points/discs, closes cloud coverage and produces muted
blue-gray sky/diffuse lighting. Rain/snow are neutral alpha-blended color only,
with depth writing disabled. Outdoor haze requires eye AND receiver sky access;
this is a proxy, so outdoor views through fully dark interiors can lack some haze.

SSR now uses the opaque HDR snapshot's own depth/validity in colortex3 alpha, not
later translucent depth, with invalid hand holes and depth-compatible filter taps.
Missing data behind a hand falls back to the environment; it is not reconstructed.
RGB F0/AO in colortex7 is now ALWAYS required (one extra logical full-size RGBA8
image without LabPBR versus 1.3.x). Iron/gold/copper and diamond have distinct base
properties; LabPBR maps still override them. Glass uses its own interface marker,
not the water path; camera-side glass remains a thin alpha-tinted approximation,
not multi-layer refractive ray tracing or locally colored light transmission.

Block-light warmth/intensity are global lightmap controls, NOT a claim that a
placed end rod's light is distinguishable from a placed torch outside screen-space
source data. Neutral/cool emitter SURFACES have gentler emission; source-specific
world propagation remains open. Bloom defaults lower; hue-aware filmic mix and
exposure ceiling help highlights. Wet roughness respects porosity and puddles
exclude metal/glass. New controls have en_US + partial ru_RU labels.

The user reports prior builds load in both Iris/OptiFine; THIS version has no local
GPU visual/performance acceptance. Use COMPARISON_TESTS.ru.md for paired captures.

## 1.3.2: stable star-free reflection environment
Direct sky rendering retains point stars. Water/material reflections deliberately
omit point stars from their environment, retaining broad night radiance/nebula,
sun and moon. The opaque reflection/refraction source uses this environment only
at sky depth, so SSR neighborhood filtering cannot blend point stars from adjacent
background pixels. GI resolve preserves this background. Opaque reflected geometry
and emissive objects are not brightness-clamped to fix stars. No new buffers/passes;
this is omission of unresolved stellar points, not physical stellar-light integration.
No in-game before/after test is available. Art references are in ART_DIRECTION.ru.md.

## Screenshot-feedback hotfix (1.3.1)
Format enums are shipped as **GLSL const integers, not macros**. Iris scans their
symbolic names after preprocessing; numeric macro expansion previously risked
silently selecting default normalized buffers (dark RGB quantization / invalid
HDR depth-history). The validator now checks real preprocessor output, not just
GLSL compile success. This is a loader-contract regression test, not an Iris runtime.
Water uses anisotropic pixel-footprint damping and warped periodic waves instead
of unfiltered directional stripes. Cave light has a gentler transition; CAVE_BRIGHTNESS
adds an explicitly artistic neutral floor, with 0 for darkness. Default emission is
1.5 and vignette is off. User before/after confirmation remains pending.

## Install
Place `Aetheris_v1.4.0.zip` unopened in `.minecraft/shaderpacks/`, remove the old
install ZIP, select the pack, RESET old settings and start MEDIUM. The install ZIP
has `shaders/` at root. SOURCE ZIPs are not shader packs. Add features one at a time;
TAA, LabPBR and POM remain opt-in. ULTRA is substantially more expensive than MEDIUM.

## New code by requested direction
1. **Analytic motion:** current/previous foliage deformation, previous-camera clip
   projection, compact motion/depth/validity buffer; TAA and motion blur consume it.
   Unknown moving entities/block entities/hands reject history; no invented uniforms
   or fake entity vectors. Full per-object/bone motion requires loader integration.
2. **Hi-Z SSR:** four min-depth raster levels, exact projective cell-exit calculation,
   conservative texel-center reads, hierarchy descent, bounded steps, hit refinement
   and roughness filtering. Temporal reflection filtering uses the common TAA path,
   so enable TAA to test it; no separate reflection-history cache or off-screen tracing.
3. **SSGI:** bounded screen-space hemisphere rays, diffuse albedo, half-size current
   radiance and optional depth/history-rejected temporal filtering. One approximate
   bounce, not global/path-traced illumination. Four-neighbor depth-aware upsample.
4. **Visible-source colored lights:** samples emissive pixels with bounded distance,
   inverse-square-style falloff and screen-space obstacle checks. Hidden/off-screen
   sources cannot contribute; not a voxel volume and may leak at missing screen data.
5. **Colored glass shadows:** opaque/translucent depths plus RGB transmittance,
   filtered with PCF/PCSS-style shadows. Nearest transparent layer only, no spectral
   multi-layer absorption. Tinted glass has an opaque transmission marker.
6. **Water:** optional animated procedural caustics under sun/sky access, shallow
   shoreline foam with breakup/up-facing gating. Not physical caustic tracing,
   fluid simulation or waterfall splash particles.
7. **Clouds:** two sky-volume layers (192–256 and 320–352 blocks), separate drift,
   sorted near-to-far integration, visual coverage fronts and rain response. Still
   sky-only volume; front fields do not control actual local weather particles.
8. **Puddles:** horizontal/sky-access/porosity masks, wetness accumulation, puddle
   smoothing/ripples, glossy approximation and loader drying half-life control.
   Overworld only; no drainage simulation or physically layered clearcoat BRDF.
9. **Dimension art direction:** generated world-1/world1 entry points, warm Nether
   ambient/fog without sun/clouds; violet End atmosphere/nebula, its own light/fog/
   exposure. Dimension-tagged history rejects cross-dimension reuse. No Overworld
   sun shadows/cloud passes in those dimensions; actual transitions remain untested.

## Profiles
| Profile | Additional advanced features |
|---|---|
| LOW | Soft sheet clouds, advanced features off, quarter effects, no SSR/shafts |
| MEDIUM | Two sheet layers, puddles/foam; no SSGI/colored gather/Hi-Z |
| HIGH | Hi-Z SSR, glass transmission, caustics, puddles, foam |
| ULTRA | HIGH plus SSGI/visible-source colored light, two cloud layers/visual fronts |

Previous shadow/AO/SSR sampling scales remain. TAA/LabPBR/POM are never switched on
by profiles. MOTION_VECTORS is used only when TAA, blur or indirect-light features
need it. All advanced passes are gated; disabling GI or Hi-Z disables their raster
passes for every dimension. Defaults are conservative; reset before selecting profiles.

## Previous rendering retained
Material-ID GGX/Smith/Schlick lighting, PCF/PCSS, water Fresnel/internal reflection/
refraction, propagated vanilla and held light, emissive blocks, atmospheric gradient/
air-mass/single-scattering modes, analytic height fog, bloom, exposure, ACES-style
tone mapping, color grading and optional camera effects. No third-party shader code.

## LabPBR/POM
Enable LAB_PBR only with a compatible resource pack (_n/_s maps; none bundled).
_n RG: normal XY; B: ambient AO; A: height. _s R: smoothness; G: dielectric F0 or
conductor IDs; B: porosity/subsurface; A: emission 0–254, **255 reserved/no emission**.
RGB conductor F0/Schlick and subsurface are approximations, not complete complex-IOR
Fresnel/diffusion. Neutral missing spec maps keep material-ID defaults; detection is
heuristic. RGBA8 RGB F0 is always retained for reflections, including fallback material IDs. Derivative tangent frames.
POM is terrain-only, distance/step-limited, atlas-clamped with half-texel inset;
foliage excluded. Height extrema are treated as flat/missing initial data. No depth
writes, silhouette displacement or POM self-shadows. Optional texture gradients
preserve original mip footprint; the fallback may be less stable. Both need runtime tests.

## Validation and cost
30 base program pairs with generated Overworld/Nether/End entries: 90 entry pairs.
22 configurations cover feature combinations, totaling 1980 pair compile/link
checks per source tree, repeated on the extracted ZIP. CPU/static/negative compiler
regressions and sampler-budget reflection are included. Packaging binds the ZIP to
the tested source hash and checks generated wrappers. This does NOT emulate loader
preprocessing, framebuffer state or GPU driver behavior.

Hi-Z adds four raster passes/targets; GI adds up to three passes, two half-size HDR
images and a full-size albedo target; analytic motion adds a full-size HDR target.
At most six simultaneous geometry output slots, not a claim about driver VRAM.
The analytic budget tool is not an FPS benchmark. TAA/GI history together can add
latency/trails; test GI_TEMPORAL=0 when diagnosing TAA ghosting. CPU reference tests
do not execute shader math on the GPU. See ARCHITECTURE.md and RUNTIME_TESTS.md.

## Remaining work
Full mob/object motion vectors, voxel/world lighting, true regional precipitation,
multiple-scattering atmosphere, foreground cloud volumes, physical caustics/foam,
full layered transparency and real cross-GPU visual/performance acceptance.

MIT license; see LICENSE.txt.
