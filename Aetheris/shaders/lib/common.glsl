#ifndef AETHERIS_COMMON
#define AETHERIS_COMMON
#include "/lib/settings.glsl"
uniform mat4 gbufferModelView, gbufferModelViewInverse;
uniform mat4 gbufferProjection, gbufferProjectionInverse;
uniform mat4 shadowModelView, shadowProjection;
uniform mat4 gbufferPreviousModelView, gbufferPreviousProjection;
uniform vec3 cameraPosition, previousCameraPosition;
uniform vec3 sunPosition, moonPosition, shadowLightPosition;
uniform float viewWidth, viewHeight, frameTimeCounter;
uniform float rainStrength, wetness, near, far, sunAngle;
uniform int worldTime, worldDay, moonPhase, isEyeInWater;
uniform int heldBlockLightValue, heldBlockLightValue2;
uniform vec4 entityColor;
uniform vec3 skyColor, fogColor;
uniform vec2 eyeBrightnessSmooth;
uniform sampler2D texture, lightmap;
uniform sampler2D colortex0, colortex1, colortex2, colortex3, colortex4, colortex5;
uniform sampler2D depthtex0, depthtex1, shadowtex0;
const float PI=3.14159265;
float saturate(float x){return clamp(x,0.0,1.0);}
vec3 linearColor(vec3 c){return pow(max(c,vec3(0.0)),vec3(2.2));}
vec3 viewPosition(vec2 uv,float d){vec4 p=gbufferProjectionInverse*vec4(uv*2.0-1.0,d*2.0-1.0,1.0);return p.xyz/p.w;}
vec3 worldRelative(vec3 p){return (gbufferModelViewInverse*vec4(p,1.0)).xyz;}
vec2 projectView(vec3 p){vec4 q=gbufferProjection*vec4(p,1.0);return q.xy/q.w*0.5+0.5;}
float dayAmount(){return smoothstep(-0.12,0.15,(mat3(gbufferModelViewInverse)*normalize(sunPosition)).y);}
vec3 sunlight(){float h=saturate((mat3(gbufferModelViewInverse)*normalize(sunPosition)).y*3.0);return mix(vec3(1.8,0.48,0.16),vec3(3.4,3.1,2.7),h);}
vec3 lightColor(){return mix(vec3(0.075,0.105,0.19),sunlight(),dayAmount())*(1.0-0.7*rainStrength);}
#endif
