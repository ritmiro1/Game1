# Runtime acceptance gate — NOT RUN in the build environment

Record loader/version, Minecraft version, GPU/driver, resolution, render distance,
profile and screenshot or log for each test. Do not mark this gate complete from
compiler output. An effect compiling does not prove framebuffer state or draw order.

| Test | Iris 1.21.4 | OptiFine 1.21.4 | Pass criterion |
|---|---|---|---|
| Load/reset/switch pack | Not run | Not run | No shader compile/link or loader errors |
| LOW/MEDIUM/HIGH/ULTRA | Not run | Not run | Every profile loads; settings affect the intended pass |
| Noon, sunrise, sunset, midnight | Not run | Not run | Light/sky transitions are continuous; night retains detail |
| Rotate camera under fixed sun | Not run | Not run | Solar color/intensity do not follow view pitch |
| Cave entrance, closed room, handheld torch | Not run | Not run | No sky glow in sealed rooms; held light attenuates |
| Shadow contact / moving camera | Not run | Not run | Softness increases with separation; no severe acne/peter-panning |
| Shadow map 1024–8192 | Not run | Not run | No crashes; bias follows resolution; record memory/time |
| Water shore / deep lake / waterfalls | Not run | Not run | No foreground refraction leaks or side-face normal corruption |
| Above / below / crossing water | Not run | Not run | No white/black flash; reflection/absorption are consistent |
| LOW water / SSR off | Not run | Not run | Absorption/refraction still work; sky fallback replaces SSR |
| Glass, particles, entities and both hands | Not run | Not run | Transparency/material MRTs do not corrupt other pixels |
| Rain / snow / lit blocks | Not run | Not run | No blown-out weather; emissives bloom without opaque halos |
| TAA off vs on, static scene | Not run | Not run | Jitter resolves; image does not wobble or progressively blur |
| TAA rotation, strafe, teleport, resize | Not run | Not run | History is rejected on cuts/resizes; no persistent black pixels |
| TAA foliage/mobs/water/hands | Not run | Not run | Inspect trails; default OFF if objectionable |
| DOF / motion blur / TAA combinations | Not run | Not run | No NaN flashes; no blur caused only by projection jitter |
| Nether / End / dimension transition | Not run | Not run | No crashes; document remaining lighting/art-direction issues |

Suggested reproducible Overworld scene: shore next to forest, cave/closed room,
reflective metal, glass, emissive blocks and an entity. Disable night vision and
resource-pack emissive overrides. Use `/time set 6000`, `12000`, `18000`, then
`/weather rain` and `/weather clear` where cheats are available.

Measure after warmup: frame-time median and p95 at fixed location and camera path.
Keep screenshots with the same FOV, time/weather and exposure. Test NVIDIA, AMD
and Intel separately; one GPU passing does not certify the other drivers.

The 1.2.0 iteration adds opt-in material and atmosphere modes without claiming
runtime acceptance. Validate those modes separately; indirect light, advanced
reflections and driver benchmarking remain future work.

## 1.2.0 acceptance additions — ALL NOT RUN

| Test | Iris | OptiFine | Pass criterion |
|---|---|---|---|
| TAA off / bloom off loader programs | Not run | Not run | Confirm skipped passes, no stale history or bloom |
| Quarter / half / full effect targets | Not run | Not run | Correct viewport/UVs, odd resolutions, no black edges |
| LabPBR off vs neutral/missing maps | Not run | Not run | Material-ID fallback remains visible and stable |
| Known LabPBR dielectric and 230–237 metal swatches | Not run | Not run | Correct normal orientation, roughness and RGB reflectance |
| Emissive alpha 0 / 254 / 255 | Not run | Not run | 254 emits; 255 does not map to emission |
| Normal AO / porosity / SSS | Not run | Not run | AO does not erase direct light; wet/leaf response bounded |
| POM terrain atlas edges / cutouts / grazing / distance | Not run | Not run | No neighbor-tile sampling, unstable mips or extreme displacement |
| Gradient extension and fallback | Not run | Not run | Both load on the actual driver; inspect mip stability |
| All atmosphere modes / horizon / sun below horizon | Not run | Not run | No NaN banding or abrupt time-of-day transitions |
| Height fog on mountains / cave / underwater | Not run | Not run | Stable density; no double underwater attenuation |
| Vanilla vs volume clouds / horizon / silhouette | Not run | Not run | No double clouds, terrain bleed or opaque black sky |
| Cloud cover/rain/wind and ground shadows | Not run | Not run | Consistent movement; document approximate shadow mismatch |
| Volume clouds + TAA/bloom/DOF | Not run | Not run | No stale reused buffer, cloud trails or sun bloom through opaque cloud |

### Real performance capture protocol
Do not infer FPS from shader-tap counts. Use the same game/loader/driver, resolution,
render distance, resource pack, world, camera path, time and weather for both builds.
Warm up 30 seconds, then collect at least 600 frame-time samples per scene/profile;
record median and p95 frame time (milliseconds), not just an FPS screenshot. Repeat
three runs. Compare base, bloom off, quarter/half/full, LabPBR, POM and volume clouds
one at a time. Record VRAM through a GPU profiler, not logical buffer-size estimates.
No such captures have been made here.

## 1.3.0 requested directions — ALL NOT RUN in Minecraft

- Inspect each new mode individually, then together, on Iris and OptiFine with
  GPU/driver, resolution, profile, dimension, resource pack and screenshots recorded.
- TAA/blur foliage motion vs camera-only: leaf motion should not create persistent
  trails. Mobs/bones are intentionally invalid history, NOT real motion vectors.
  Check disocclusion, unknown entity markers, hands, sky and dimension-tag resets.
- Hi-Z: compare linear SSR and hierarchy at shallow angles, thin geometry, odd
  resolutions, near/far camera planes and screen edges. Check conservative minima
  and that hierarchy descent fits within the selected ray budget. Temporal reflection
  filtering requires TAA. No new off-screen geometry is reconstructed.
- SSGI: colored-wall bounce, enclosed room, silhouettes, bright sources, moving
  entities, GI_TEMPORAL on/off, TAA on/off. Inspect leakage, noise, afterimages,
  thin-wall failures and the reserved GI-history texel near the upper-left corner.
- Visible-emitter colored gather: compare lava/glowstone in view vs hidden/offscreen.
  Offscreen contribution is NOT expected: this is not voxel/world light propagation.
- Glass shadows: white/red/blue/black panes over floor, sun angle/bias/PCF, tinted
  glass, opaque roof behind glass, multi-pane limitations and depth0/depth1 ordering.
- Caustics: shallow/deep lake above/below water, night, overhang, submerged ceiling;
  shoreline foam on horizontal water only. No physical/splash simulation expected.
- Clouds: below/between/above both layers, ray direction reversal, coverage fronts,
  sun visibility, no double vanilla/volume clouds; actual local precipitation is
  still Minecraft-global/biome-driven, not controlled by this visual front field.
- Puddles: fresh rain, prolonged rain, clear weather + drying, porous vs nonporous,
  walls/undersides, opaque roof, puddle ripples vs no rain, transitions into Nether/End.
- All profiles and portal travel in Overworld/Nether/End: correct entry point paths,
  fog/exposure/sky, no Overworld clouds/sun shadows outside Overworld, no old history.
- Inspect full attachment allocation (colortex0–15) and draw-slot remapping, active
  samplers, actual VRAM, p50/p95 frame time. Static reflection is not a driver test.

Two major acceptance gaps remain: full previous mob/bone transforms are not part
of this pack's common loader contract, and no voxel backend is supplied. A future
backend must gather world geometry/emissive data and implement propagation; merely
renaming the current gather is not a solution.


## 1.3.1 screenshot-feedback follow-up — NOT RUN here
- Record Iris/OptiFine exact version, GPU/driver and profile before comparing the
  same tunnel shots. Check actual colortex0/3/6 RGBA16F, 9–12 R32F when enabled,
  and negative history markers; no numeric-format warnings in loader logs.
- Move away from an end rod slowly; stone detail should remain neutral/readable,
  with no RGB threshold islands. Test CAVE_BRIGHTNESS 0/0.5/1/2, torch light and
  pitch-black enclosed rooms separately. Cave fill is artistic, not physically real GI.
- Repeat horizon/grazing-water views above/below the surface, stationary and moving,
  at 720p/1080p/1440p and different FOV. Check disappearance of distant Moire,
  preserved nearby ripples, world X/Z=0 and 4096 seams, and SSR off/linear/Hi-Z.
- Check rod texture/bloom after resetting old settings (emission default changed).
  A white emissive model is not itself a proof of an HDR failure.


## 1.3.2 star reflection gate — NOT RUN here
- Use the same night shore view as the FIRST bug screenshot, reset settings, keep
  time/FOV/resolution fixed, and record a clip with waves + camera movement.
- Compare LOW (SSR off), MEDIUM (linear SSR), HIGH (Hi-Z SSR), ULTRA (GI resolve),
  plus TAA on/off and GI_TEMPORAL on/off. Check that no point-star field returns
  through reflection fallback, SSR silhouette filter taps, or GI source overwrite.
- Direct sky still has stars; sun/moon/broad night radiance and reflected geometry /
  emissive objects must remain. Inspect Overworld and End; Nether has no star layer.
- Test sunset/day and above/below water, opaque shoreline edges, portals, and both
  loader families. This removes unresolved point stars rather than physically
  preintegrating their tiny reflected energy; no claim of full reflection antialiasing.
- Remaining submitted images are REFERENCES, not evidence of bugs in this build.

## 1.4.0 specific acceptance
See COMPARISON_TESTS.ru.md for fixed-camera wet village / metal / glass / emitter
comparisons. The user reports both loaders work with previous builds; this is not
a pass for THIS version. Cloud mode 3 is a ground-scene 2.5D approximation, not a
fly-through cloud volume; use mode 2 to evaluate flying through clouds. Check rain
against metal materials, TAA on/off, dark rooms, and sky at rainStrength approaching 1.
