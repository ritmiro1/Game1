#version 120
#include "/lib/common.glsl"
#include "/lib/temporal.glsl"
varying vec2 uv;
/* DRAWBUFFERS:06 */
void main(){
 vec3 current=texture2D(colortex0,uv).rgb;
 float historyDepth;
 vec3 resolved=resolveTemporal(uv,current,texture2D(depthtex0,uv).r,historyDepth);
 gl_FragData[0]=vec4(resolved,1.0);
 gl_FragData[1]=vec4(resolved,historyDepth);
 // RGBA16F exactly represents frame index modulo 1024 and common even dimensions.
 if(gl_FragCoord.x<1.0 && gl_FragCoord.y<1.0)
  gl_FragData[1]=vec4(viewWidth,viewHeight,mod(float(frameCounter),1024.0),TAA==1?-1.0:-2.0);
}
