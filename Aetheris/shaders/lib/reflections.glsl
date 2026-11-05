#ifndef AETHERIS_REFLECTIONS
#define AETHERIS_REFLECTIONS
#include "/lib/hiz.glsl"
// Bounded SSR with binary refinement, eye-plane/edge rejection and sky fallback.
vec3 reflectedScene(vec3 p,vec3 n,float rough,vec3 skyFallback){
 vec3 ray=safeNormalize(reflect(safeNormalize(p),n));
#if REFLECTION_STEPS > 0
 if(length(p)>SSR_DISTANCE)return skyFallback;
 int budget=int(mix(float(REFLECTION_STEPS),max(4.0,float(REFLECTION_STEPS)*0.5),smoothstep(SSR_DISTANCE*0.3,SSR_DISTANCE,length(p))));
 vec3 origin=p+n*0.08,q=origin,previous=origin;
 #if HIZ_SSR == 1
 int level=3;
#endif
 for(int i=0;i<REFLECTION_STEPS;i++){
  if(i>=budget)break;
  #if HIZ_SSR == 0
  previous=q;q+=ray*(0.18+float(i)*0.12);
#endif
  if(q.z>=-near)break;
  vec2 t=projectView(q);
  if(any(lessThan(t,vec2(0.001)))||any(greaterThan(t,vec2(0.999))))break;
  #if HIZ_SSR == 1
  if(level>=0){
   float zMin=minimumDepth(t,level),depthQ=-q.z;
   if(depthQ<zMin-0.06){
    float advance=rayCellExit(q,ray,t,level)+0.0002;
    if(ray.z< -0.001)advance=min(advance,max(0.01,(zMin-depthQ-0.04)/(-ray.z)));
    previous=q;q+=ray*clamp(advance,0.01,8.0);level=level<3?level+1:3;continue;
   }
   level--;continue;
  }
#endif
  float d=texture2D(depthtex1,t).r;
  if(d>=0.99999){
#if HIZ_SSR == 1
   previous=q;q+=ray*0.2;level=0;
#endif
   continue;
  }
  float delta=viewPosition(t,d).z-q.z;
  if(delta>0.0 && delta<0.12+float(i)*0.07){
   vec3 a=previous,b=q;
   for(int j=0;j<4;j++){
    vec3 mid=(a+b)*0.5;vec2 u=projectView(mid);
    float md=texture2D(depthtex1,safeUV(u)).r;
    if(md<0.99999 && viewPosition(u,md).z>mid.z)b=mid;else a=mid;
   }
   vec2 hit=projectView((a+b)*0.5);
   float edge=min(min(hit.x,hit.y),min(1.0-hit.x,1.0-hit.y));
   float confidence=smoothstep(0.0,0.12,edge)*(1.0-smoothstep(0.3,0.7,rough));
   vec3 radiance=texture2D(colortex3,safeUV(hit)).rgb;
   vec2 spread=vec2(rough*2.0)/vec2(viewWidth,viewHeight);
   radiance=(radiance*2.0+texture2D(colortex3,safeUV(hit+spread)).rgb+texture2D(colortex3,safeUV(hit-spread)).rgb)*0.25;
   return mix(skyFallback,radiance,confidence);
  }
#if HIZ_SSR == 1
  previous=q;q+=ray*0.12;level=0;
#endif
 }
#endif
 return skyFallback;
}
#endif
