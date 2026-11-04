#ifndef AETHERIS_CLOUDS
#define AETHERIS_CLOUDS
const float cloudBase=192.0;
const float cloudTop=256.0;
vec2 cloudDrift(){return vec2(frameTimeCounter*0.6,frameTimeCounter*0.18);}
float cloudFootprint(vec2 worldXZ){
 vec2 p=(worldXZ+cloudDrift())*0.0015;
 float coverage=clamp(CLOUD_COVERAGE+rainStrength*0.18,0.05,0.95);
 return smoothstep(1.0-coverage-0.12,1.0-coverage+0.12,fbm(p));
}
float cloudDensity(vec3 worldP){
 float h=(worldP.y-cloudBase)/(cloudTop-cloudBase);
 if(h<=0.0||h>=1.0)return 0.0;
 float envelope=smoothstep(0.0,0.22,h)*(1.0-smoothstep(0.65,1.0,h));
 float shape=cloudFootprint(worldP.xz);
#if CLOUD_QUALITY > 1
 // Height-dependent detail gives a 3D density field, not a flat scrolling sheet.
 shape=max(0.0,shape-(1.0-aetherNoise((worldP.xz+cloudDrift())*0.018+worldP.y*0.035))*0.25);
#endif
 return shape*envelope;
}
float cloudGroundVisibility(vec3 worldP){
#if CLOUD_MODE == 0 || CLOUD_QUALITY == 0
 return 1.0;
#else
 vec3 lightW=safeNormalize(mat3(gbufferModelViewInverse)*shadowLightPosition);
 if(lightW.y<0.02)return 1.0;
 float t=(mix(cloudBase,cloudTop,0.5)-worldP.y)/lightW.y;
 if(t<=0.0)return 1.0;
 float shadow=cloudFootprint(worldP.xz+lightW.xz*t);
 return mix(1.0,exp(-shadow*1.5),smoothstep(0.02,0.08,lightW.y));
#endif
}
// Cheap cloud-aware reflection fallback; not a second expensive volume march.
vec3 cloudSkyFallback(vec3 sky,vec3 ray){
#if CLOUD_MODE == 2
 if(ray.y>0.01){
  float t=(mix(cloudBase,cloudTop,0.5)-cameraPosition.y)/ray.y;
  if(t>0.0){float density=cloudFootprint(cameraPosition.xz+ray.xz*t);float trans=exp(-density*3.0);
   sky=sky*trans+mix(vec3(0.012,0.02,0.035),vec3(0.45,0.52,0.62),dayAmount())*(1.0-trans);}
 }
#endif
 return sky;
}
vec4 marchClouds(vec3 ray,float maxDistance,vec2 pixel){
 vec4 result=vec4(0,0,0,1);
#if CLOUD_MODE == 2 && CLOUD_QUALITY > 0
 if(isEyeInWater==1)return result;
 float start=0.0,finish=min(maxDistance,12000.0);
 if(abs(ray.y)<0.001){if(cameraPosition.y<cloudBase||cameraPosition.y>cloudTop)return result;}
 else{
  float a=(cloudBase-cameraPosition.y)/ray.y,b=(cloudTop-cameraPosition.y)/ray.y;
  start=max(0.0,min(a,b));finish=min(finish,max(a,b));
 }
 if(finish<=start)return result;
 float stepLength=(finish-start)/float(CLOUD_STEPS);
 float offset=hash12(floor(pixel));
 vec3 lightW=safeNormalize(mat3(gbufferModelViewInverse)*shadowLightPosition);
 float mu=max(dot(ray,lightW),0.0),forward=0.2+pow(mu,10.0)*1.4;
 vec3 ambient=mix(vec3(0.008,0.014,0.026),vec3(0.27,0.36,0.48),dayAmount())*(1.0-rainStrength*0.4);
 for(int i=0;i<CLOUD_STEPS;i++){
  float t=start+(float(i)+offset)*stepLength;
  vec3 p=cameraPosition+ray*t;float density=cloudDensity(p);
  if(density>0.005){
   float sunOptical=cloudDensity(p+lightW*24.0)*0.8+cloudDensity(p+lightW*60.0)*0.6;
   vec3 lighting=ambient+lightColor()*exp(-sunOptical*2.0)*forward*0.22;
   float attenuation=exp(-density*stepLength*0.035);
   result.rgb+=result.a*(1.0-attenuation)*lighting;result.a*=attenuation;
   if(result.a<0.015)break;
  }
 }
#endif
 return result;
}
#endif
