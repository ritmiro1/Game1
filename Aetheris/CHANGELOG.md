# Changelog

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
