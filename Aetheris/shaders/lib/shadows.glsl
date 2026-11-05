#ifndef AETHERIS_SHADOWS
#define AETHERIS_SHADOWS
#include "/lib/clouds.glsl"
// Identical warp in the writer and receiver; the depth axis stays linear.
vec3 distortShadow(vec3 p){p.xy/=0.15+length(p.xy)*0.85;p.z*=0.2;return p;}
float cloudShadow(vec3 p){return cloudGroundVisibility(p+cameraPosition);}
bool insideShadow(vec3 t){return all(greaterThan(t,vec3(0.002)))&&all(lessThan(t,vec3(0.998)));}
vec3 shadowCoordinate(vec3 p){vec4 q=shadowProjection*shadowModelView*vec4(p,1.0);return distortShadow(q.xyz/q.w)*0.5+0.5;}
vec2 shadowDisk(int i,int count){float a=float(i)*2.399963;return vec2(cos(a),sin(a))*sqrt((float(i)+0.5)/float(count));}
// One tap for volumetric marching: never nest PCSS blocker searches in a ray march.
float shadowVisibilityFast(vec3 p){vec3 t=shadowCoordinate(p);if(!insideShadow(t))return 1.0;return step(t.z-0.00008,texture2D(shadowtex0,t.xy).r);}
vec3 shadowTap(vec3 t,vec2 uv,float bias){
 float nearest=texture2D(shadowtex0,uv).r;
#if COLORED_SHADOWS == 1
 float opaque=texture2D(shadowtex1,uv).r;
 if(t.z-bias>opaque)return vec3(0.0);
 if(t.z-bias>nearest)return clamp(texture2D(shadowcolor0,uv).rgb,0.0,1.0);
 return vec3(1.0);
#else
 return vec3(step(t.z-bias,nearest));
#endif
}
vec3 shadowTransmission(vec3 p,vec3 n){
#if defined(AETHER_NETHER) || defined(AETHER_END)
 return vec3(1.0);
#else

 vec3 lightW=safeNormalize(mat3(gbufferModelViewInverse)*shadowLightPosition);
 float grazing=1.0-saturate(dot(n,lightW));
 float texelScale=2048.0/float(shadowMapResolution);
 vec3 t=shadowCoordinate(p+n*(0.012+grazing*0.025)*texelScale);
 if(!insideShadow(t))return vec3(cloudShadow(p));
 float bias=(0.000025+grazing*0.000055)*texelScale;
 float radius=1.25;
#if PCSS == 1
 float blockerDepth=0.0,blockers=0.0;
 for(int i=0;i<SHADOW_BLOCKER_SAMPLES;i++){
  vec2 offset=shadowDisk(i,SHADOW_BLOCKER_SAMPLES)*5.0/float(shadowMapResolution);
  float z=texture2D(shadowtex0,clamp(t.xy+offset,vec2(0.001),vec2(0.999))).r;
  if(z<t.z-bias){blockerDepth+=z;blockers+=1.0;}
 }
 if(blockers>0.0){
  // Convert orthographic normalized depth separation back to world units.
  float separation=max(t.z-blockerDepth/blockers,0.0)/max(abs(shadowProjection[2][2])*0.1,1e-6);
  vec4 clip=shadowProjection*shadowModelView*vec4(p,1.0);
  float distortion=0.15+length(clip.xy/clip.w)*0.85;
  radius=clamp(separation*0.0093*abs(shadowProjection[0][0])*0.5/ distortion*float(shadowMapResolution)*SHADOW_SOFTNESS,1.25,9.0);
 }
#endif
 vec3 result=vec3(0.0);
 for(int i=0;i<SHADOW_SAMPLES;i++){
  vec2 offset=shadowDisk(i,SHADOW_SAMPLES)*radius/float(shadowMapResolution);
  result+=shadowTap(t,clamp(t.xy+offset,vec2(0.001),vec2(0.999)),bias);
 }
 float edge=smoothstep(shadowDistance*0.72,shadowDistance,length(p));
 return mix(result/float(SHADOW_SAMPLES),vec3(1.0),edge)*cloudShadow(p);
#endif
}
float shadowVisibility(vec3 p,vec3 n){return dot(shadowTransmission(p,n),vec3(0.333333));}
#endif
