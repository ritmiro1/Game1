# AETHERIS 1.2.0 — performance → materials → atmosphere

Original GLSL 1.20 shader pack for Minecraft Java. Intended targets: **Iris/Fabric
1.21.4**, then OptiFine 1.21.4. This is a shader pack, not a mod or resource pack.
**EXPERIMENTAL.** Static compiler/CPU checks are automated. No Minecraft or GPU
runtime is installed in the build environment: loader behavior, visuals, memory
allocation and FPS are NOT verified. All new rendering modes need runtime review.

## Install / update
1. Install matching Minecraft Java 1.21.4 and Iris/Fabric or OptiFine.
2. Remove the old Aetheris install ZIP from `.minecraft/shaderpacks/`.
3. Put **Aetheris_v1.2.0.zip** there without extracting it. The ZIP has `shaders/`
   directly at its root. The SOURCE ZIP is development source, not an install pack.
4. Select Aetheris, **reset old shader settings**, start with MEDIUM.
5. Leave LAB_PBR/POM/TAA/DOF/motion blur OFF for the initial baseline.

## 1. Performance-first changes (not a measured FPS claim)
- The temporal resolve/history write is disabled at loader-program level when TAA
  is OFF, rather than copying a full-resolution image every frame.
- BLOOM_ENABLED=0 disables both bloom programs and the final bloom sample.
- Bloom and volumetric clouds share a temporary target at quarter/half/full width
  and height. HALF is the default; LOW uses QUARTER. Clouds finish reading it before
  bloom overwrites it. Both bloom targets use matching reduced dimensions.
- Vertical Gaussian blur pairs adjacent taps: 5 reads vs the former 9. Horizontal
  bright filtering uses 9 reads. At half dimensions that is an analytic 3.5 filter
  reads per full-resolution pixel vs the old 18 (excluding final upsampling).
  This is a shader-operation estimate, **not** an equivalent FPS improvement.
- AO fades out at its configured distance and skips its loop at strength zero.
  Emissive light is protected from AO darkening; hands skip AO.
- SSR has a maximum distance and decreases its step budget with distance.
- Shadow blocker/PCF searches are skipped for hands, surfaces without sky access
  and unlit-facing surfaces unless subsurface lighting needs visibility.
- LabPBR and volume clouds cost extra; selecting ULTRA is not an optimization.
  Run `tools/performance_budget.py` for analytic bounds, not benchmark results.

## 2. Opt-in LabPBR materials and limited POM
Enable **MATERIALS → LAB_PBR=1** only with compatible resource-pack `_n` and `_s`
maps. If available, enable normal/specular maps in your loader. No resource pack
or third-party textures are bundled.

Supported LabPBR-style channel subset:
- `_n`: RG tangent-space normal XY; B ambient occlusion; A height for POM.
- `_s`: R perceptual smoothness (BRDF squares roughness to GGX alpha);
  G dielectric F0 / conductor IDs 230–237, with generic conductor fallback for
  other metal IDs; B porosity 0–64 or subsurface 65–255; A emission 0–254.
  **Alpha 255 means no mapped emission**, not maximum emission.
- Conductor F0 uses RGB approximations and Schlick Fresnel, not full complex-IOR
  angular Fresnel. Normal-map AO affects ambient, not direct light. Porosity affects
  wet darkening; subsurface is a modest backlight approximation, not diffusion.
- Neutral missing maps keep block-ID roughness/F0/emission defaults. Texture map
  detection is heuristic; an intentionally all-zero specular map is ambiguous.
- Mapped RGB F0 is retained for reflections in an optional linear RGBA8 attachment
  (4 bytes per pixel per logical image, before any loader/driver buffering).
- Tangent frames are derived in the fragment shader, avoiding extra tangent varyings.

**POM=1 requires LAB_PBR=1**, authored height data, and terrain UV metadata.
It is OFF by default, terrain-only, limited to 12/24/48 blocks, clamped to the
current atlas tile with a half-texel inset, and capped at 8/12/20 steps. Mapped foliage
is excluded. It changes sampled texture position, not geometry/depth or silhouettes.
Pure-black/white initial height texels are treated as flat/missing data; extreme
height fields may therefore show discontinuities. No POM self-shadowing yet.
Optional guarded GL_ARB_shader_texture_lod gradients preserve the original texture
footprint through the ray march where available; an implicit-LOD fallback compiles
without the extension but may be less stable. Resource-pack/driver validation remains open.

## 3. Atmosphere, height fog and clouds
- ATMOSPHERE_QUALITY=0 keeps the gradient; 1 uses a cheap air-mass approximation;
  2 integrates single scattering with 6 view × 4 light samples, Rayleigh/Mie density,
  ozone absorption and planet occlusion. This is not a multiple-scattering solver.
  Reflections retain the cheaper fit rather than repeating the full atmosphere march.
- Height fog analytically integrates an exponential density field along the view ray,
  with rain-dependent extinction and modest directional inscattering. It is disabled
  underwater, where the existing water extinction handles attenuation once.
- CLOUD_MODE=0 off; 1 shaded vanilla cloud geometry; 2 experimental volume layer.
  LOW/MEDIUM/HIGH keep mode 1; ULTRA selects mode 2.
- Volume clouds use a 192–256-block sky layer with height-dependent 3D density,
  wind, coverage/rain response, short light-density queries and early transmittance
  termination. The march is capped at CLOUD_STEPS and uses the reduced effect target.
- Sky-neighbor-aware upsampling prevents clouds drawing over opaque terrain edges.
  Volume clouds are composed before optional TAA and bloom so the sun is attenuated
  before bloom extraction. No volume cloud contribution inside terrain pixels yet:
  this is a sky-layer renderer, not an arbitrary foreground cloud/fog volume.
- Ground shadows share cloud footprint/wind and project along the light direction,
  but use an optical-depth approximation rather than the exact rendered volume.
  Reflection fallback uses a cheap projected cloud estimate, not the full volume.

## Profiles
| Profile | Effects scale | Atmosphere | Clouds | Shadow | AO | SSR |
|---|---|---|---|---|---|---|
| LOW | quarter each axis | gradient | vanilla | 1024 / 4 PCF | 4, 24 blocks | off |
| MEDIUM | half each axis | air-mass fit | vanilla | 2048 / 8 PCF | 8, 48 blocks | 8, 48 blocks |
| HIGH | half each axis | air-mass fit | vanilla | 2048 / 8 PCF | 16, 64 blocks | 16, 64 blocks |
| ULTRA | half each axis | single scatter | volume, 20 steps | 4096 / 16 PCF | 16, 96 blocks | 32, 96 blocks |

LAB_PBR, POM and TAA remain opt-in and are not enabled automatically by profiles.
Settings persist: reset first, then pick a profile. Defaults lie between MEDIUM/HIGH.
Volume clouds, LabPBR and POM can be enabled separately for A/B testing.

## Previous features retained
GGX/Smith/Schlick lighting; distorted PCF / PCSS-style shadows; animated water with
Fresnel/internal reflection, depth-checked refraction and SSR; propagated block and
held lights; emissive block IDs; procedural celestial bodies/stars; wetness; AO;
ACES-style tone mapping, exposure, grading, optional DOF/camera blur and experimental
TAA with depth/history rejection. TAA lacks per-object motion vectors and may ghost.

## Remaining limitations
No PTGI/SSGI, hierarchical SSR, colored shadow transmission, caustics/foam, snow
accumulation, weather-front simulation, physical multiple scattering, POM depth
writes/self-shadowing or dedicated Nether/End art direction. No production-ready
quality/FPS claim. The explicit runtime acceptance matrix remains **NOT RUN**.

## License
MIT; see LICENSE.txt. Original shader code; channel conventions follow LabPBR.
