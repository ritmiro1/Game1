#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/water.glsl"
attribute vec4 mc_Entity;
varying vec2 uv,lm;
varying vec4 tint;
varying vec3 normalV,positionV,positionW;
varying float material;
void main(){
 vec4 p=gl_ModelViewMatrix*gl_Vertex;vec3 wp=worldRelative(p.xyz);
 material=mc_Entity.x;
#ifndef HAND_PASS
 if(material==10003.0){p.xyz+=(gbufferModelView*vec4(sin((wp.x+cameraPosition.x)*0.6+frameTimeCounter*1.8)*0.025,0,0,0)).xyz;}
#endif
 gl_Position=jitterClip(gl_ProjectionMatrix*p);
 positionV=p.xyz;positionW=wp+cameraPosition;
 normalV=safeNormalize(gl_NormalMatrix*gl_Normal);uv=(gl_TextureMatrix[0]*gl_MultiTexCoord0).xy;
 lm=clamp((gl_TextureMatrix[1]*gl_MultiTexCoord1).xy,0.0,1.0);tint=gl_Color;
}
