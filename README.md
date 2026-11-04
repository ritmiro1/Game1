# Aetheris — Minecraft cinematic shader pack

Original GLSL 1.20 speed-build targeting Iris / Fabric 1.21.4 and OptiFine 1.21.4.
See [the pack documentation](Aetheris/README.md) for features, honest limitations,
installation and validation status. This is an **experimental, statically tested**
shader pack, not an in-game-verified production release.

Source: `Aetheris/shaders/`. Twenty vertex/fragment pairs plus shared GLSL libraries.

## Build and validate

```sh
# Obtain a glslangValidator compatible with your platform, then:
python3 tools/validate.py --compiler /path/to/glslangValidator
python3 tools/package.py
```

The validator resolves loader-style includes and injects the loader's RGBA16F
symbol before compiling and linking every pair for LOW/MEDIUM/HIGH/ULTRA plus
camera-effect and disabled-feature variants. It does not emulate Minecraft,
OptiFine/Iris preprocessing, driver compilation, draw order, or framebuffer state.

`artifacts/` contains the install ZIP, explicitly named source ZIP, checksums and
validation report. Install ZIP root is `shaders/`; source ZIP root is `Aetheris/`.
Release assets are published on this repository's GitHub Releases page.
