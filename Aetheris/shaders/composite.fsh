#version 120
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
 vec3 p=viewPosition(uv,d);vec4 material=texture2D(colortex2,uv),nr=texture2D(colortex1,uv);
 vec3 n=safeNormalize(nr.xyz*2.0-1.0);bool water=material.g>0.5;
 if(d<0.99999 && (water || nr.a<0.45)){
  vec3 ray=reflect(safeNormalize(p),n);
  // Sky reflections are reduced indoors, rather than glowing in closed caves.
  vec3 fallback=atmosphere(safeNormalize(mat3(gbufferModelViewInverse)*ray))*pow(saturate(material.b),2.0);
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
   under+=vec3(0.012,0.075,0.095)*(1.0-transmission)*mix(0.12,1.0,dayAmount())*material.b;
   c=mix(under,reflected,f)+c*0.12;
  }else{
   vec3 F=fresnel(dot(n,safeNormalize(-p)),mix(vec3(0.04),vec3(0.65),material.r));
   c=mix(c,reflected,F*(1.0-nr.a)*saturate(material.b));
  }
 }
 // Underwater attenuation once, after refraction, for the camera-to-surface segment.
 if(isEyeInWater==1){float waterDistance=d<0.99999?length(p):48.0;vec3 tr=waterTransmission(waterDistance);c=c*tr+vec3(0.01,0.065,0.085)*(1.0-tr)*mix(0.12,1.0,dayAmount());}
#if VOLUMETRIC_STEPS > 0
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
