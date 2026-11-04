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
uniform int frameCounter;
uniform int worldTime, worldDay, moonPhase, isEyeInWater;
uniform int heldBlockLightValue, heldBlockLightValue2;
uniform vec4 entityColor;
uniform vec3 skyColor, fogColor;
uniform ivec2 eyeBrightnessSmooth;
uniform sampler2D texture, lightmap;
#if LAB_PBR == 1
uniform sampler2D normals, specular;
uniform ivec2 atlasSize;
#endif
uniform sampler2D colortex0, colortex1, colortex2, colortex3, colortex4, colortex5, colortex6, colortex7;
uniform sampler2D depthtex0, depthtex1, shadowtex0;
const float PI=3.14159265;
float saturate(float x){return clamp(x,0.0,1.0);}
vec3 linearColor(vec3 c){return pow(max(c,vec3(0.0)),vec3(2.2));}
// Eight-sample Halton (2,3), expressed without GLSL 1.20 array constructors.
vec2 temporalJitter(int frame){
#if TAA == 1
 float i=mod(float(frame),8.0);vec2 j;
 if(i<0.5)j=vec2(0.5,0.333333);else if(i<1.5)j=vec2(0.25,0.666667);
 else if(i<2.5)j=vec2(0.75,0.111111);else if(i<3.5)j=vec2(0.125,0.444444);
 else if(i<4.5)j=vec2(0.625,0.777778);else if(i<5.5)j=vec2(0.375,0.222222);
 else if(i<6.5)j=vec2(0.875,0.555556);else j=vec2(0.0625,0.888889);
 return (j-0.5)/vec2(viewWidth,viewHeight);
#else
 return vec2(0.0);
#endif
}
vec4 jitterClip(vec4 clip){clip.xy+=temporalJitter(frameCounter)*2.0*clip.w;return clip;}
vec2 safeUV(vec2 uv){vec2 edge=0.5/vec2(viewWidth,viewHeight);return clamp(uv,edge,1.0-edge);}
vec2 effectDimensions(){
#if EFFECT_RESOLUTION == 0
 return max(floor(vec2(viewWidth,viewHeight)*0.25),vec2(1.0));
#elif EFFECT_RESOLUTION == 1
 return max(floor(vec2(viewWidth,viewHeight)*0.5),vec2(1.0));
#else
 return vec2(viewWidth,viewHeight);
#endif
}
vec3 safeNormalize(vec3 v){return v*inversesqrt(max(dot(v,v),1e-12));}
vec3 viewPosition(vec2 uv,float d){vec4 p=gbufferProjectionInverse*vec4((uv-temporalJitter(frameCounter))*2.0-1.0,d*2.0-1.0,1.0);return p.xyz/p.w;}
vec3 worldRelative(vec3 p){return (gbufferModelViewInverse*vec4(p,1.0)).xyz;}
vec2 projectView(vec3 p){vec4 q=gbufferProjection*vec4(p,1.0);return q.xy/q.w*0.5+0.5+temporalJitter(frameCounter);}
// Solar elevation in WORLD space: camera rotation must not change time of day.
float solarHeight(){return (mat3(gbufferModelViewInverse)*safeNormalize(sunPosition)).y;}
float dayAmount(){return smoothstep(-0.10,0.14,solarHeight());}
vec3 sunlight(){float h=smoothstep(0.0,0.45,solarHeight());return mix(vec3(2.3,0.68,0.23),vec3(3.5,3.25,2.95),h);}
vec3 lightColor(){
 float h=solarHeight();float sunPower=smoothstep(-0.04,0.07,h);
 float moonPower=(1.0-smoothstep(-0.14,0.02,h))*(0.25+0.75*(0.5+0.5*cos(float(moonPhase)*PI/4.0)));
 return (sunlight()*sunPower+vec3(0.055,0.082,0.145)*moonPower*NIGHT_BRIGHTNESS)*(1.0-0.78*rainStrength);
}
// Eye-brightness exposure proxy, smoothed by the loader, not scene-luminance metering.
float adaptedExposure(){
#if AUTO_EXPOSURE == 1
 float sky=pow(saturate(float(eyeBrightnessSmooth.y)/240.0),2.0);
 float block=pow(saturate(float(eyeBrightnessSmooth.x)/240.0),3.0);
 float level=sky*mix(0.035,0.42,dayAmount())+block*0.16;
 return EXPOSURE*clamp(0.20/(0.055+level),0.65,2.6);
#else
 return EXPOSURE;
#endif
}
#endif
