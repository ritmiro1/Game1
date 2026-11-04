#ifndef AETHERIS_REFLECTIONS
#define AETHERIS_REFLECTIONS
// Bounded SSR with binary refinement, eye-plane/edge rejection and sky fallback.
vec3 reflectedScene(vec3 p,vec3 n,float rough,vec3 skyFallback){
 vec3 ray=safeNormalize(reflect(safeNormalize(p),n));
#if REFLECTION_STEPS > 0
 vec3 origin=p+n*0.08,q=origin,previous=origin;
 for(int i=0;i<REFLECTION_STEPS;i++){
  previous=q;q+=ray*(0.18+float(i)*0.12);
  if(q.z>=-near)break;
  vec2 t=projectView(q);
  if(any(lessThan(t,vec2(0.001)))||any(greaterThan(t,vec2(0.999))))break;
  float d=texture2D(depthtex1,t).r;
  if(d>=0.99999)continue;
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
   return mix(skyFallback,texture2D(colortex3,safeUV(hit)).rgb,confidence);
  }
 }
#endif
 return skyFallback;
}
#endif
