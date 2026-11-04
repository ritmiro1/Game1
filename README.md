# Aetheris 1.1.0 — cinematic Minecraft shader development

Original GLSL 1.20 shader pack intended for Minecraft Java 1.21.4,
Iris/Fabric first and OptiFine second. **Experimental, statically tested;
not certified in-game.** Source lives in `Aetheris/shaders/`.

This iteration follows priorities **1 → 2 → 3 → 5 → 9**: stronger contract and
regression tests, natural lighting/exposure, PCSS-style soft shadows, improved
water above/below the surface, and spatial AA plus optional experimental TAA.
See [pack documentation](Aetheris/README.md) and the explicit
[uncompleted runtime acceptance matrix](Aetheris/RUNTIME_TESTS.md).
Other roadmap directions are deferred until the runtime baseline is accepted.

## Validate, test, package
Requires Python 3.11+ and `glslangValidator` (GLSL 1.20 compatibility support).
No test-only format macros are supplied to the compiler.

```sh
python3 tools/validate.py --compiler /path/to/glslangValidator
GLSLANG_VALIDATOR=/path/to/glslangValidator python3 -m unittest discover -s tests -v
cp artifacts/validation.json tests/validation.json
python3 tools/package.py
python3 -m zipfile -e artifacts/Aetheris_v1.1.0.zip .cache/extracted
python3 tools/validate.py --root .cache/extracted/shaders \
  --compiler /path/to/glslangValidator --output artifacts/archive-validation.json
```

The validator checks includes, program pairs, option ranges/menu names, and compiles
all 21 pairs in 10 configurations, including TAA/camera combinations and disabled
features. Unit tests reproduce the old RGBA16F error after intentionally removing
the fix, verify option labels/history guards, and check reference math. These do
NOT emulate loader preprocessing, GPU runtime state, draw order or visuals.
Packaging refuses failed/stale reports by hashing the actual shader sources.
CI repeats the checks, packages and recompiles the extracted ZIP.

## Install
Put **Aetheris_v1.1.0.zip**, unopened, in `.minecraft/shaderpacks/`; select it,
reset old shader settings and start MEDIUM with TAA/DOF/motion blur OFF.
Only the install ZIP has the loader's `shaders/` root. The source ZIP is not a pack.
Small downloadable ZIPs are intentionally tracked in `downloads/` because the
sandbox cannot use GitHub's release-asset upload host. Old immutable release tags
retain their original downloads.

## Regression history
1.0.1 fixed an undefined `RGBA16F` in deferred rendering; the original validator
had masked the bug by injecting that macro. 1.1.0 keeps definitions in the shader,
tests the failure negatively, and binds packaging to the tested source digest.
