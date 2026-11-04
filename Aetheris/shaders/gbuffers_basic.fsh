#version 120
#include "/lib/common.glsl"
#include "/lib/fog.glsl"
varying vec4 tint;
varying float distanceV;
/* DRAWBUFFERS:0 */
void main(){vec3 c=linearColor(tint.rgb)*(0.3+dayAmount()*0.6);vec3 direction=viewPosition(gl_FragCoord.xy/vec2(viewWidth,viewHeight),gl_FragCoord.z);gl_FragData[0]=vec4(aerialFog(c,safeNormalize(direction)*distanceV),tint.a);}
