#ifndef AETHERIS_REFLECTIONS
#define AETHERIS_REFLECTIONS
#include "/lib/hiz.glsl"
// Source alpha is opaque view depth, zero for sky/hand. Never use the later
// translucent depth/normal layers to validate an earlier opaque HDR snapshot.
vec4 reflectionTexel(vec2 uv){
 vec2 size=vec2(viewWidth,viewHeight);
 return texture2D(colortex3,(clamp(floor(uv*size),vec2(0),size-1.0)+0.5)/size);
}
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
  float sourceDepth=reflectionTexel(t).a;
  float delta=-q.z-sourceDepth;
  if(sourceDepth>0.0 && delta>0.0 && delta<0.12+float(i)*0.05){
   vec3 a=previous,b=q;
   for(int j=0;j<5;j++){
    vec3 mid=(a+b)*0.5;
    float mz=reflectionTexel(safeUV(projectView(mid))).a;
    if(mz>0.0 && -mid.z>mz)b=mid;else a=mid;
   }
   vec3 hitP=(a+b)*0.5;vec2 hit=projectView(hitP);
   vec4 center=reflectionTexel(hit);
   float residual=abs(center.a+hitP.z);
   float tolerance=max(0.08,-hitP.z*0.003);
   float edge=min(min(hit.x,hit.y),min(1.0-hit.x,1.0-hit.y));
   if(center.a>0.0 && residual<tolerance && length(hitP-origin)>0.15 && edge>0.0){
    float confidence=smoothstep(0.0,0.12,edge)*(1.0-smoothstep(0.35,0.75,rough));
    vec3 sum=center.rgb*2.0;float weight=2.0;
    // Reject invalid/foreground taps instead of smearing held items across metals.
    vec2 spread=vec2(rough*4.0)/vec2(viewWidth,viewHeight);
    for(int tap=0;tap<4;tap++){
     vec2 offset=tap==0?vec2(spread.x,0):(tap==1?vec2(-spread.x,0):(tap==2?vec2(0,spread.y):vec2(0,-spread.y)));
     vec4 value=reflectionTexel(safeUV(hit+offset));
     if(value.a>0.0 && abs(value.a-center.a)<max(0.12,center.a*0.015)){sum+=value.rgb;weight+=1.0;}
    }
    return mix(skyFallback,sum/weight,confidence);
   }
  }
#if HIZ_SSR == 1
  previous=q;q+=ray*0.12;level=0;
#endif
 }
#endif
 return skyFallback;
}
#endif
