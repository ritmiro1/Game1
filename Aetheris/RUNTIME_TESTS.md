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

Remaining order after runtime acceptance: LabPBR/POM, more robust reflections,
atmosphere/clouds, indirect light; performance profiling throughout. Do not stack
these on an unverified baseline and call all ten directions complete.
