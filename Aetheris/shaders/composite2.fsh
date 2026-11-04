#version 120
#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/post.glsl"
varying vec2 uv;
/* DRAWBUFFERS:4 */
void main(){vec3 c=vec3(0);float w=0.0;for(int i=-4;i<=4;i++){float k=exp(-float(i*i)/8.0);vec2 t=clamp(uv+vec2(float(i)*3.0/viewWidth,0),vec2(0.001),vec2(0.999));c+=bright(texture2D(colortex0,t).rgb)*k;w+=k;}gl_FragData[0]=vec4(c/w,1);}
