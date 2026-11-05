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
  gl_FragData[1]=vec4(floor(viewWidth/16.0),floor(viewHeight/16.0),mod(float(frameCounter),1024.0),TAA==1?-dimensionTag():-(dimensionTag()+4.0));
 if(gl_FragCoord.x>=1.0 && gl_FragCoord.x<2.0 && gl_FragCoord.y<1.0)
  gl_FragData[1]=vec4(floor(float(frameCounter)/1024.0),mod(viewWidth,16.0),mod(viewHeight,16.0),-dimensionTag());
}
