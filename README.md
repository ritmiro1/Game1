# Aetheris 1.2.0 — performance → materials → atmosphere

Original Minecraft GLSL 1.20 shader pack targeting Iris/Fabric 1.21.4, with OptiFine
as secondary target. **Experimental. No in-game or GPU benchmark certification.**
Source: `Aetheris/shaders/`. See [features and limits](Aetheris/README.md) and
[the runtime acceptance matrix](Aetheris/RUNTIME_TESTS.md).

This iteration reduces unnecessary passes and effect-buffer resolution, adds opt-in
LabPBR material decoding / bounded terrain POM, and introduces scattering modes,
analytic height fog and optional reduced-resolution volumetric sky clouds.
LAB_PBR/POM/TAA default OFF; start MEDIUM and test additions separately.

## Validate and package
Python 3.11+, glslangValidator with GLSL 1.20 compatibility support. No test-only
format macros or driver symbols are injected.

```sh
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

23 program pairs × 15 configurations, including all features, disabled effects,
quarter/full buffers, LabPBR/POM and TAA/camera combinations. The validator audits
includes, options, a deliberately limited conditional-properties subset and program
contracts. It does not emulate Iris/OptiFine, GPU state or rendering. Unit tests
include negative RGBA16F and missing-gradient-extension regressions and reference
math. Packaging is gated by the exact tested source digest. CI repeats validation,
unit tests, packaging and compilation of the extracted ZIP.

`performance_budget.py` outputs **analytic operation/memory bounds, not measured
FPS**. It excludes final upsampling, light/depth queries, overdraw and driver costs.
For real profiling use the fixed-scene procedure in RUNTIME_TESTS.md.

Install only `Aetheris_v1.2.0.zip`, unopened, in `.minecraft/shaderpacks/`; reset
old shader settings. Source ZIPs are not install packs. Small release downloads
are tracked in `downloads/` because the sandbox blocks GitHub's asset upload host.
The `aetheris-v1.2.0` tag distinguishes this shader from an unrelated existing
repository release called `v1.2.0`; historical releases are not overwritten.
