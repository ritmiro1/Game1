#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/clouds.glsl"
varying vec2 uv;
/* DRAWBUFFERS:4 */
void main(){
 float depth=texture2D(depthtex0,uv).r;
 if(depth<0.99999){gl_FragData[0]=vec4(0,0,0,1);return;}
 vec3 ray=safeNormalize(mat3(gbufferModelViewInverse)*viewPosition(uv,1.0));
 gl_FragData[0]=marchClouds(ray,12000.0,uv*effectDimensions());
}
