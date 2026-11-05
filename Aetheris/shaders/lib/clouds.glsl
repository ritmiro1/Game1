#ifndef AETHERIS_CLOUDS
#define AETHERIS_CLOUDS
const float cloudBase=192.0,cloudTop=256.0;
vec2 cloudDrift(){return vec2(frameTimeCounter*0.6,frameTimeCounter*0.18);}
float weatherFront(vec2 p){
#if WEATHER_FRONTS == 1
 return (fbm(p*0.00016+vec2(frameTimeCounter*0.000015,0.0))-0.5)*FRONT_STRENGTH;
#else
 return 0.0;
#endif
}
float layerFootprint(vec2 worldXZ,int layer){
 vec2 drift=cloudDrift()*(layer==0?1.0:1.7);
 vec2 p=(worldXZ+drift)*(layer==0?0.0015:0.0008)+float(layer)*17.0;
 float coverage=clamp(CLOUD_COVERAGE+rainStrength*0.18+weatherFront(worldXZ),0.05,0.95);
 return smoothstep(1.0-coverage-0.12,1.0-coverage+0.12,fbm(p));
}
float cloudFootprint(vec2 worldXZ){return layerFootprint(worldXZ,0);}
float layerDensity(vec3 p,int layer){
 float base=layer==0?cloudBase:320.0,top=layer==0?cloudTop:352.0;
 float h=(p.y-base)/(top-base);if(h<=0.0||h>=1.0)return 0.0;
 float shape=layerFootprint(p.xz,layer);
#if CLOUD_QUALITY > 1
 shape=max(0.0,shape-(1.0-aetherNoise((p.xz+cloudDrift())*0.018+p.y*0.035))*0.25);
#endif
 return shape*smoothstep(0.0,0.22,h)*(1.0-smoothstep(0.65,1.0,h));
}
float cloudDensity(vec3 worldP){return layerDensity(worldP,0);}
float cloudGroundVisibility(vec3 worldP){
#if CLOUD_MODE == 0 || CLOUD_QUALITY == 0 || defined(AETHER_NETHER) || defined(AETHER_END)
 return 1.0;
#else
 vec3 lightW=safeNormalize(mat3(gbufferModelViewInverse)*shadowLightPosition);if(lightW.y<0.02)return 1.0;
 float optical=0.0;
 for(int layer=0;layer<CLOUD_LAYERS;layer++){
  float height=layer==0?224.0:336.0,t=(height-worldP.y)/lightW.y;
  if(t>0.0)optical+=layerFootprint(worldP.xz+lightW.xz*t,layer)*1.5;
 }
 return mix(1.0,exp(-optical),smoothstep(0.02,0.08,lightW.y));
#endif
}
vec3 cloudSkyFallback(vec3 sky,vec3 ray){
#if CLOUD_MODE == 2 && !defined(AETHER_NETHER) && !defined(AETHER_END)
 if(ray.y>0.01){
  // Far layer first, then near: cheap projected fallback, not a volume reflection.
  for(int i=0;i<CLOUD_LAYERS;i++){
   int layer=CLOUD_LAYERS-1-i;float height=layer==0?224.0:336.0,t=(height-cameraPosition.y)/ray.y;
   if(t>0.0){float trans=exp(-layerFootprint(cameraPosition.xz+ray.xz*t,layer)*3.0);
    sky=sky*trans+mix(vec3(0.012,0.02,0.035),vec3(0.45,0.52,0.62),dayAmount())*(1.0-trans);}
  }
 }
#endif
 return sky;
}
vec4 marchLayer(vec3 ray,float maxDistance,vec2 pixel,int layer){
 vec4 result=vec4(0,0,0,1);float base=layer==0?cloudBase:320.0,top=layer==0?cloudTop:352.0;
 float start=0.0,finish=min(maxDistance,12000.0);
 if(abs(ray.y)<0.001){if(cameraPosition.y<base||cameraPosition.y>top)return result;}
 else{float a=(base-cameraPosition.y)/ray.y,b=(top-cameraPosition.y)/ray.y;start=max(0.0,min(a,b));finish=min(finish,max(a,b));}
 if(finish<=start)return result;
 float stepLength=(finish-start)/float(CLOUD_STEPS),offset=hash12(floor(pixel)+float(layer)*37.0);
 vec3 lightW=safeNormalize(mat3(gbufferModelViewInverse)*shadowLightPosition);
 float forward=0.2+pow(max(dot(ray,lightW),0.0),10.0)*1.4;
 vec3 ambient=mix(vec3(0.008,0.014,0.026),vec3(0.27,0.36,0.48),dayAmount())*(1.0-rainStrength*0.4);
 for(int i=0;i<CLOUD_STEPS;i++){
  vec3 p=cameraPosition+ray*(start+(float(i)+offset)*stepLength);float density=layerDensity(p,layer);
  if(density>0.005){
   float sunOptical=layerDensity(p+lightW*24.0,layer)*0.8+layerDensity(p+lightW*60.0,layer)*0.6;
   vec3 lighting=ambient+lightColor()*exp(-sunOptical*2.0)*forward*0.22;
   float attenuation=exp(-density*stepLength*0.035);
   result.rgb+=result.a*(1.0-attenuation)*lighting;result.a*=attenuation;
   if(result.a<0.015)break;
  }
 }
 return result;
}
vec4 marchClouds(vec3 ray,float maxDistance,vec2 pixel){
 vec4 result=vec4(0,0,0,1);
#if CLOUD_MODE == 2 && CLOUD_QUALITY > 0 && !defined(AETHER_NETHER) && !defined(AETHER_END)
 if(isEyeInWater==1)return result;
 for(int i=0;i<CLOUD_LAYERS;i++){
  int layer=ray.y>=0.0?i:CLOUD_LAYERS-1-i;
  vec4 value=marchLayer(ray,maxDistance,pixel,layer);result.rgb+=result.a*value.rgb;result.a*=value.a;
  if(result.a<0.015)break;
 }
#endif
 return result;
}
#endif
