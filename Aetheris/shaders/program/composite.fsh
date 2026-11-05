#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/shadows.glsl"
#include "/lib/sky.glsl"
#include "/lib/lighting.glsl"
#include "/lib/water.glsl"
#include "/lib/reflections.glsl"
varying vec2 uv;
/* DRAWBUFFERS:0 */
void main(){
 vec3 c=texture2D(colortex0,uv).rgb;float d=texture2D(depthtex0,uv).r;
 vec3 p=viewPosition(uv,d);
#if defined(AETHER_NETHER) || defined(AETHER_END)
 if(d>=0.99999)c=renderSky(safeNormalize(mat3(gbufferModelViewInverse)*p));
#endif
 vec4 material=texture2D(colortex2,uv),nr=texture2D(colortex1,uv);
 vec3 n=safeNormalize(nr.xyz*2.0-1.0);bool water=material.g>0.5 && material.g<1.5;
 if(d<0.99999 && !(material.a> -1.5 && material.a< -0.5) && (water || nr.a<0.7)){
  vec3 ray=reflect(safeNormalize(p),n);
  // Sky reflections are reduced indoors, rather than glowing in closed caves.
  vec3 rayW=safeNormalize(mat3(gbufferModelViewInverse)*ray);
  vec3 fallback=cloudSkyFallback(reflectionSky(rayW),rayW)*pow(saturate(material.b),2.0);
  if(isEyeInWater==1)fallback=vec3(0.012,0.065,0.085)*mix(0.12,1.0,dayAmount());
  vec3 reflected=reflectedScene(p,n,nr.a,fallback);
  if(water){
   bool submerged=isEyeInWater==1;
   float f=waterFresnel(saturate(dot(n,safeNormalize(-p))),submerged);
   float opaqueD=texture2D(depthtex1,uv).r;
   float distanceBehind=opaqueD<0.99999?max(0.0,length(viewPosition(uv,opaqueD))-length(p)):32.0;
   // Fade refraction near shore/occluders and reject samples in front of the water.
   float bend=(1.0-exp(-distanceBehind*0.3))*WATER_REFRACTION*0.012;
   vec2 refr=safeUV(uv+n.xy*bend/max(0.5,abs(n.z)));
   float rd=texture2D(depthtex1,refr).r;
   if(rd<d+0.00001){refr=uv;rd=opaqueD;}
   float thickness=rd<0.99999?max(0.0,length(viewPosition(refr,rd))-length(p)):32.0;
   // The water column lies BEFORE the interface underwater: no double deep-water absorption.
   vec3 transmission=waterTransmission(submerged?0.0:thickness);
   vec3 under=texture2D(colortex3,refr).rgb*transmission;
#if CAUSTICS == 1 && !defined(AETHER_NETHER) && !defined(AETHER_END)
   if(!submerged && rd<0.99999){vec3 ground=worldRelative(viewPosition(refr,rd))+cameraPosition;
    under*=1.0+causticPattern(ground)*CAUSTIC_STRENGTH*celestialVisibility()*exp(-thickness*0.15)*dayAmount()*material.b*shadowVisibilityFast(worldRelative(viewPosition(refr,rd)));}
#endif
   under+=vec3(0.012,0.075,0.095)*(1.0-transmission)*mix(0.12,1.0,dayAmount())*material.b;
   c=mix(under,reflected,f)+c*0.12;
#if FOAM == 1 && !defined(AETHER_NETHER) && !defined(AETHER_END)
   if(!submerged){vec3 point=worldRelative(p)+cameraPosition;float foam=shoreFoam(point,thickness)*max(0.0,(mat3(gbufferModelViewInverse)*n).y);
    c=mix(c,vec3(0.55,0.65,0.68)*mix(0.08,1.0,dayAmount()),foam);}
#endif
  }else{
   vec3 surfaceF0=texture2D(colortex7,uv).rgb;
   vec3 F=fresnel(dot(n,safeNormalize(-p)),surfaceF0);
   c=mix(c,reflected,F*(1.0-nr.a));
  }
 }
 // Underwater attenuation once, after refraction, for the camera-to-surface segment.
 if(isEyeInWater==1){float waterDistance=d<0.99999?length(p):48.0;vec3 tr=waterTransmission(waterDistance);c=c*tr+vec3(0.01,0.065,0.085)*(1.0-tr)*mix(0.12,1.0,dayAmount());
#if CAUSTICS == 1 && !defined(AETHER_NETHER) && !defined(AETHER_END)
 if(d<0.99999&&!water){vec3 worldN=mat3(gbufferModelViewInverse)*n;
  c*=1.0+causticPattern(worldRelative(p)+cameraPosition)*CAUSTIC_STRENGTH*celestialVisibility()*max(worldN.y,0.0)*material.b*dayAmount()*shadowVisibilityFast(worldRelative(p));}
#endif
 }
#if VOLUMETRIC_STEPS > 0 && !defined(AETHER_NETHER) && !defined(AETHER_END)
 if(isEyeInWater!=1){
  float maxLen=min(length(p),96.0),scatter=0.0;
  for(int i=0;i<VOLUMETRIC_STEPS;i++){
   // Screen-stationary pattern, not time-randomized: avoid flickering without TAA.
   float t=(float(i)+hash12(floor(gl_FragCoord.xy)))/float(VOLUMETRIC_STEPS);
   vec3 wp=worldRelative(safeNormalize(p)*maxLen*t);scatter+=shadowVisibilityFast(wp);
  }
  float phase=0.08+pow(max(dot(safeNormalize(p),safeNormalize(shadowLightPosition)),0.0),12.0);
  c+=lightColor()*scatter/float(VOLUMETRIC_STEPS)*phase*(1.0-exp(-maxLen*0.018))*VOLUMETRIC_STRENGTH;
 }
#endif
 gl_FragData[0]=vec4(max(c,vec3(0.0)),1);
}
