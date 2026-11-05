# Aetheris 1.4.0 — advanced shader iteration

Original shader pack intended for Minecraft Java 1.21.4 / Iris (primary) and
OptiFine (secondary). **Experimental: no in-game/GPU/FPS certification.**
[Features/limits](Aetheris/README.md) · [exact requested-feature status (RU)](Aetheris/FEATURE_STATUS.ru.md)
· [render graph](Aetheris/ARCHITECTURE.md) · [runtime gate](Aetheris/RUNTIME_TESTS.md)

Adds analytic foliage motion, Hi-Z SSR, screen-space indirect/visible-emissive
colored lighting, tinted glass shadows, procedural caustics/shore foam, two cloud
layers/visual fronts, puddles and dimension-specific art direction. **Full mob
motion vectors and voxel light propagation are NOT implemented.** Cloud fronts do
not alter actual regional rain/snow. These are not labelled complete substitutes.

## 1.4.0 weather/material pass
Adds soft sheet cloud defaults, overcast/celestial weather response, neutral
color-only rain/snow, outdoor-access haze, snapshot-depth SSR/hand rejection,
always-on RGB material F0, glass interface tagging and more restrained bloom /
block-light controls. [Paired comparison checklist](Aetheris/COMPARISON_TESTS.ru.md).
No local GPU visual/FPS acceptance; no per-source world/voxel light backend.

## 1.3.2 star-reflection hotfix
Separate direct sky stars from a star-free reflection environment; clean sky-depth
SSR source texels and preserve them through GI resolve. Direct sky stars and broad
night lighting/sun/moon remain. No global highlight clamp, new buffers or GPU quality
claims. [Art-reference goals](Aetheris/ART_DIRECTION.ru.md) record the distinction
between the user's first bug frame and the remaining reference frames.

## 1.3.1 screenshot hotfix
Fixes symbolic framebuffer formats being macro-expanded before Iris parsed them;
adds a real post-preprocessor format audit. Also adds footprint-filtered/warped water
waves, smoother block light and configurable artistic cave readability. No visual
before/after run has been performed here. Reference screenshots are still needed
for the next art-direction pass; this does not claim parity with leading packs.

## Sources / generated entry points
Canonical stage bodies: `Aetheris/shaders/program/`. Shared code: `shaders/lib/`.
Root/world-1/world1 wrappers are generated; never hand-edit them. Thirty base pairs
× three dimensions × twenty-two configurations = 1980 static pair checks per tree.
All advanced color buffers are described in ARCHITECTURE.md. Modern 1.21.4 loaders
must support RENDERTARGETS attachment remapping up to colortex15; GPU tests remain open.

## Validate, test, package
Python 3.11+ and glslangValidator with GLSL 1.20 compatibility support. No injected
test-only format constants or fabricated driver symbols.

```sh
python3 tools/sync_dimensions.py --check
python3 tools/validate.py --compiler /path/to/glslangValidator
GLSLANG_VALIDATOR=/path/to/glslangValidator python3 -m unittest discover -s tests -v
python3 tools/performance_budget.py > artifacts/performance-budget.json
cp artifacts/validation.json tests/validation.json
python3 tools/package.py
VERSION=$(cat Aetheris/VERSION)
python3 -m zipfile -e "artifacts/Aetheris_v${VERSION}.zip" .cache/extracted
python3 tools/validate.py --root .cache/extracted/shaders \
  --compiler /path/to/glslangValidator --output artifacts/archive-validation.json
```

CI repeats the checks including extracted ZIP compilation and active sampler2D
reflection against a 16-sampler budget. Conditional-property auditing covers only
the subset used here; it is not an Iris/OptiFine emulator. Packaging refuses stale
shader reports or wrapper drift. Analytic operation/memory counts are NOT GPU timing.

Install only `Aetheris_v1.4.0.zip` unopened in `.minecraft/shaderpacks/`, RESET old
settings, start MEDIUM; enable expensive modes one at a time. Source ZIP is not a
pack. Small ZIPs are tracked in downloads/ because the sandbox blocks release-asset
uploads. Releases use `aetheris-v1.4.0`; unrelated existing tags are not overwritten.
