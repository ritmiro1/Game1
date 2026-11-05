# AETHERIS 1.3.0 — experimental advanced screen-space rendering

Original Minecraft shader pack, **not a mod/resource pack/datapack**.
Intended targets: Iris/Fabric 1.21.4, then OptiFine 1.21.4, modern desktop OpenGL.
GLSL 1.20 syntax with an optional guarded texture-gradient extension for LabPBR/POM.
**No Minecraft/GPU runtime is available here: compilation is NOT in-game certification.**

**Not all nine requested features are complete:** analytic motion tracks this pack's
foliage, not mob/bone animation; colored lighting is visible-emitter screen space,
NOT voxel light propagation; moving cloud fronts do NOT change Minecraft's actual
regional rain/snow. See [precise Russian feature status](FEATURE_STATUS.ru.md).

## Install
Place `Aetheris_v1.3.0.zip` unopened in `.minecraft/shaderpacks/`, remove the old
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
| LOW | Advanced features off, quarter effects, no SSR/shafts |
| MEDIUM | Puddles and shoreline foam; no SSGI/colored gather/Hi-Z |
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
heuristic. Optional RGBA8 F0 is retained for reflections. Derivative tangent frames.
POM is terrain-only, distance/step-limited, atlas-clamped with half-texel inset;
foliage excluded. Height extrema are treated as flat/missing initial data. No depth
writes, silhouette displacement or POM self-shadows. Optional texture gradients
preserve original mip footprint; the fallback may be less stable. Both need runtime tests.

## Validation and cost
30 base program pairs with generated Overworld/Nether/End entries: 90 entry pairs.
19 configurations cover feature combinations, totaling 1710 pair compile/link
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
