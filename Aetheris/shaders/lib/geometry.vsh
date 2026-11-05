#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/water.glsl"
#include "/lib/motion.glsl"
attribute vec4 mc_Entity;
#if LAB_PBR == 1 && POM == 1 && defined(TERRAIN_PASS)
attribute vec2 mc_midTexCoord;
varying vec4 tileBounds;
#endif
varying vec2 uv,lm;
varying vec4 tint;
varying vec3 normalV,positionV,positionW;
varying float material;
#ifdef AETHER_VELOCITY_ACTIVE
varying vec4 previousClip;
#endif
void main(){
 vec4 p=gl_ModelViewMatrix*gl_Vertex;vec3 wp=worldRelative(p.xyz);
 material=mc_Entity.x;
#ifdef AETHER_VELOCITY_ACTIVE
 previousClip=previousSurfaceClip(wp,material);
#endif
#ifndef HAND_PASS
 if(material==10003.0){p.xyz+=(gbufferModelView*vec4(foliageWind(wp+cameraPosition,frameTimeCounter),0,0,0)).xyz;}
#endif
 gl_Position=jitterClip(gl_ProjectionMatrix*p);
 positionV=p.xyz;positionW=wp+cameraPosition;
 normalV=safeNormalize(gl_NormalMatrix*gl_Normal);uv=(gl_TextureMatrix[0]*gl_MultiTexCoord0).xy;
 #if LAB_PBR == 1 && POM == 1 && defined(TERRAIN_PASS)
 vec2 mid=(gl_TextureMatrix[0]*vec4(mc_midTexCoord.xy,0.0,1.0)).xy;
 tileBounds=vec4(mid,abs(uv-mid));
#endif
 lm=clamp((gl_TextureMatrix[1]*gl_MultiTexCoord1).xy,0.0,1.0);tint=gl_Color;
}
