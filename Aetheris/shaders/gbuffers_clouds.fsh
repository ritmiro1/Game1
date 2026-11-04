#version 120
#include "/lib/common.glsl"
#include "/lib/noise.glsl"
varying vec3 vp;varying vec4 tint;
/* DRAWBUFFERS:0 */
void main(){
#if CLOUD_QUALITY == 0
 discard;
#else
 vec3 w=worldRelative(vp)+cameraPosition;float detail=1.0;
#if CLOUD_QUALITY > 1
 detail=0.65+0.35*fbm(w.xz*0.04+frameTimeCounter*0.01);
#endif
 vec3 c=mix(vec3(0.035,0.05,0.09),vec3(0.65,0.74,0.86),dayAmount())*detail;
 c+=lightColor()*0.12*tint.r;gl_FragData[0]=vec4(c,tint.a*0.85);
#endif
}
