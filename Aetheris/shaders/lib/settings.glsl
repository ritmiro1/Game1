#ifndef AETHERIS_SETTINGS
#define AETHERIS_SETTINGS
#define SHADOW_SAMPLES 8 // [4 8 16]
#define AO_SAMPLES 8 // [4 8 16]
#define AO_STRENGTH 0.65 // [0.0 0.35 0.65 1.0]
#define AO_RADIUS 0.8 // [0.4 0.8 1.2 2.0]
#define REFLECTION_STEPS 16 // [0 8 16 32]
#define WATER_QUALITY 2 // [1 2 3]
#define VOLUMETRIC_STEPS 8 // [0 4 8 16]
#define VOLUMETRIC_STRENGTH 0.35 // [0.0 0.2 0.35 0.6]
#define CLOUD_QUALITY 2 // [0 1 2]
#define BLOOM_STRENGTH 0.18 // [0.0 0.1 0.18 0.3 0.5]
#define BLOOM_THRESHOLD 1.0 // [0.7 1.0 1.5 2.0]
#define EXPOSURE 1.0 // [0.5 0.75 1.0 1.25 1.5 2.0]
#define SATURATION 1.05 // [0.8 0.9 1.0 1.05 1.15]
#define EMISSIVE_BRIGHTNESS 2.5 // [1.0 1.5 2.5 4.0]
#define COLOR_GRADE 1 // [0 1 2]
#define DOF 0 // [0 1]
#define DOF_STRENGTH 0.5 // [0.25 0.5 1.0]
#define MOTION_BLUR 0 // [0 1]
#define MOTION_BLUR_STRENGTH 0.5 // [0.25 0.5 1.0]
#define VIGNETTE 1 // [0 1]
#define FXAA 1 // [0 1]
const int shadowMapResolution = 2048; // [1024 2048 4096 8192]
const float shadowDistance = 128.0; // [64.0 96.0 128.0 192.0]
const float sunPathRotation = -30.0;
// Raw depth samples are compared manually for PCF.
const bool shadowHardwareFiltering = false;
const bool shadowtex0Nearest = true;
#endif
