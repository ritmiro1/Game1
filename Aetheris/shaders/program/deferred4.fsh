#include "/lib/common.glsl"
varying vec2 uv;
/* RENDER12S:12 */
void main(){
 vec2 parentSize=max(floor(vec2(viewWidth,viewHeight)*0.125),vec2(1.0));
 float nearestDepth=min(far,32000.0);
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 t=clamp(uv+vec2(float(x),float(y))/parentSize,0.5/parentSize,1.0-0.5/parentSize);
  t=(floor(t*parentSize)+0.5)/parentSize;
  float z=texture2D(colortex11,t).r;
  nearestDepth=min(nearestDepth,z);
 }
 gl_FragData[0]=vec4(nearestDepth,0,0,1);
}
