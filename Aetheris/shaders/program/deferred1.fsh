#include "/lib/common.glsl"
varying vec2 uv;
/* RENDER9S:9 */
void main(){
 vec2 parentSize=vec2(viewWidth,viewHeight);
 float nearestDepth=min(far,32000.0);
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 t=clamp(uv+vec2(float(x),float(y))/parentSize,0.5/parentSize,1.0-0.5/parentSize);
  t=(floor(t*parentSize)+0.5)/parentSize;
  float d=texture2D(depthtex0,t).r;float z=d>=0.99999?min(far,32000.0):max(0.0,-viewPosition(t,d).z);
  if(texture2D(colortex2,t).a<0.0)z=min(far,32000.0);
  nearestDepth=min(nearestDepth,z);
 }
 gl_FragData[0]=vec4(nearestDepth,0,0,1);
}
