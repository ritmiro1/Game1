#include "/lib/common.glsl"
varying vec3 vp;varying vec4 tint;
void main(){vec4 p=gl_ModelViewMatrix*gl_Vertex;vp=p.xyz;tint=gl_Color;gl_Position=jitterClip(gl_ProjectionMatrix*p);}
