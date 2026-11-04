#version 120
#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/shadows.glsl"
attribute vec4 mc_Entity;
varying vec2 uv;varying vec4 tint;
void main(){vec4 p=gl_ModelViewMatrix*gl_Vertex;
// Apply the same world-space foliage displacement used by terrain.
if(mc_Entity.x==10003.0){vec3 wp=(gl_ModelViewMatrixInverse*p).xyz;float dx=sin((wp.x+cameraPosition.x)*0.6+frameTimeCounter*1.8)*0.025;p+=gl_ModelViewMatrix*vec4(dx,0,0,0);}
vec4 q=gl_ProjectionMatrix*p;q.xyz=distortShadow(q.xyz/q.w)*q.w;gl_Position=q;uv=gl_MultiTexCoord0.xy;tint=gl_Color;}
