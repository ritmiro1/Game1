#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/shadows.glsl"
#include "/lib/motion.glsl"
attribute vec4 mc_Entity;
varying vec2 uv;varying vec4 tint;varying float material;
void main(){material=mc_Entity.x;vec4 p=gl_ModelViewMatrix*gl_Vertex;
// Apply the same world-space foliage displacement used by terrain.
if(mc_Entity.x==10003.0){vec3 wp=(gl_ModelViewMatrixInverse*p).xyz;float dx=foliageWind(wp+cameraPosition,frameTimeCounter);p+=gl_ModelViewMatrix*vec4(dx,0,0,0);}
vec4 q=gl_ProjectionMatrix*p;q.xyz=distortShadow(q.xyz/q.w)*q.w;gl_Position=q;uv=gl_MultiTexCoord0.xy;tint=gl_Color;}
