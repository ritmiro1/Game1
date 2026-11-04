#version 120
#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/post.glsl"
varying vec2 uv;
/* DRAWBUFFERS:5 */
void main(){gl_FragData[0]=vec4(bloomBlur(colortex4,uv,vec2(0,1.0/effectDimensions().y)),1);}
