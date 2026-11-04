#version 120
#include "/lib/common.glsl"
varying vec4 tint;
varying float distanceV;
/* DRAWBUFFERS:0 */
void main(){vec3 c=linearColor(tint.rgb)*(0.3+dayAmount()*0.6);float fog=1.0-exp(-distanceV*(0.00035+rainStrength*0.002));gl_FragData[0]=vec4(mix(c,linearColor(fogColor)*0.7,fog),tint.a);}
