# Changelog

## 1.4.0 — 2026-11-05, weather/material art-direction pass

- Opaque source alpha now stores matching linear depth; zero marks sky/hand holes.
  SSR validates/refines against this snapshot, rejects held-item pixels, uses point
  metadata reads and depth-compatible roughness taps. GI preserves source validity.
- Always write RGBA8 RGB F0/AO, including non-LabPBR fallback materials. Separate
  iron/gold/copper/diamond IDs, distinct roughness/F0, thin glass interface marker.
  Glass is no longer confused with water; hands do not receive screen reflections.
- CLOUD_MODE=3: world-anchored 2.5D optical cloud sheet with optional upper wisps,
  quality-scaled noise, weather coverage/lighting, no vanilla cloud geometry or
  volume raster passes. LOW/MEDIUM/HIGH use it; ULTRA keeps volume mode 2.
- Rain suppresses celestial points/discs, drives gray-blue overcast sky, diffuse
  ambient and cloud cover. Outdoor haze uses BOTH eye and receiver skylight.
- Dedicated neutral alpha-blended rain/snow color pass; rain.depth=false and no
  material/normal writes. Reduce outdoor TAA history during precipitation.
- Global block-light warmth/intensity controls, gentler neutral/cool emitter surface
  emission, lower bloom defaults, bounded hue-aware filmic mix and exposure ceiling.
  Wet roughness respects porosity; puddles exclude metals/glass. Caustics respect weather.
- 22 compile configurations, additional contract/reference tests; Russian labels for
  new controls. Actual world light-source colors/colored transmission from local
  lamps are NOT supplied by the vanilla lightmap; no voxel backend added.
- User reports prior packs work on both Iris and OptiFine. THIS build still needs
  in-game comparison; static tests cannot establish parity with reference images.


## 1.3.2 — 2026-11-05, point-star reflection hotfix

- Split the visible sky from the reflection environment: point stars stay in the
  direct Overworld/End sky but are intentionally omitted from reflected radiance.
  Broad atmosphere/nebula, sun and moon are retained, not globally dimmed.
- Use this environment for water/material reflection fallback and sky-depth texels
  in the opaque SSR/refraction source. This also prevents SSR filter taps at geometry
  silhouettes from blending bright point stars out of the background.
- GI resolve preserves the star-free background rather than copying the visible
  star field into the reflection source again. No additional render target/pass.
- First submitted frame is a bug report; the other frames are art-direction
  references, NOT additional Aetheris bug evidence. See ART_DIRECTION.ru.md.
- Static regressions added; no local Minecraft/GPU reproduction or claim of parity
  with the reference shader pack. Physical stellar energy integration is not supplied:
  this is a deliberate omission of unresolved point stars in reflections.


## 1.3.1 — 2026-11-05, screenshot-feedback hotfix

- Fix a real Iris loader contract bug: enum macros expanded RGBA16F/RGBA8/R32F
  into numeric format strings before Iris parsed them. Use GLSL const definitions
  so the driver compiles AND the loader retains symbolic format names. This can
  restore actual HDR precision/depth/history instead of default normalized buffers.
- Validate format directives AFTER a real GLSL preprocessor, including a regression
  proving the previous broken version compiled successfully but lost loader formats.
- Water slopes use Gaussian pixel-footprint filtering, multiple warped directions
  and periodic Fourier vectors; suppress distant wave aliasing without blurring scene
  textures. Caller derivatives are computed before fragment discard/divergence.
- Gentler block-light curve, less orange tint, adjustable neutral artistic cave fill
  (CAVE_BRIGHTNESS=0 restores darkness). Default emission 1.5; vignette defaults off.
- Screenshot feedback is diagnostic input, not proof of a fix in Minecraft. No
  before/after GPU run is available here; real loader/profile confirmation is needed.


## 1.3.0 — 2026-11-05, experimental

- Analytic foliage motion buffer consumed by TAA/blur; reject unknown entity history.
- Four-level conservative raster Hi-Z SSR; common TAA can filter reflections.
- Half-size SSGI and visible-emitter colored gather with optional indirect history.
- Closest-layer colored glass shadow transmission; procedural water caustics/shore foam.
- Two volume cloud layers and moving visual coverage fronts; wetness-driven puddles.
- Separate Nether/End programs, lighting/fog/sky/exposure and dimension history tags.
- Generated dimension wrappers, source-hash packaging gate, sampler-budget reflection,
  split frame/viewport metadata and tests for odd viewport sizes / stale history.

Incomplete by design in this build: full mob/bone/object vectors, voxel/world light
propagation, actual localized precipitation, waterfall splash simulation, dedicated
SSR history, physically traced caustics. See FEATURE_STATUS.ru.md for exact scope.
No Minecraft/GPU acceptance or FPS measurements. Do not treat static compilation
as in-game certification.

Previous v1.2.0, v1.1.0 and v1.0.1 releases remain available under their original tags.
