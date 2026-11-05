#ifndef AETHERIS_FOG
#define AETHERIS_FOG
// Analytic integral of an exponential height-density field along the view ray.
vec3 aerialFog(vec3 color,vec3 vp,float skyLight){
 if(isEyeInWater==1 || FOG_DENSITY<=0.0)return color;
 float distanceV=length(vp);
#ifdef AETHER_NETHER
 float dimensionTrans=exp(-distanceV*0.005*FOG_DENSITY);return color*dimensionTrans+vec3(0.16,0.025,0.006)*(1.0-dimensionTrans);
#elif defined(AETHER_END)
 float dimensionTrans=exp(-distanceV*0.0018*FOG_DENSITY);return color*dimensionTrans+vec3(0.035,0.018,0.075)*(1.0-dimensionTrans);
#endif
 vec3 ray=safeNormalize(mat3(gbufferModelViewInverse)*vp);
 float heightChange=ray.y*distanceV;
 float x=clamp(heightChange/80.0,-12.0,12.0);
 float integral=abs(x)<0.001?1.0-x*0.5:(1.0-exp(-x))/x;
 float cameraDensity=exp(clamp(-(cameraPosition.y-64.0)/80.0,-6.0,1.4));
 // Require receiver AND eye access to sky: no storm haze in sealed tunnels.
 float access=outdoorAccess(skyLight)*outdoorAccess(float(eyeBrightnessSmooth.y)/240.0);
 float extinction=0.00012*mix(0.05,1.0,access)+weatherAmount()*0.003*WEATHER_HAZE*access;
 float optical=distanceV*cameraDensity*integral*extinction*FOG_DENSITY;
 float trans=exp(-max(0.0,optical));
 vec3 lightW=safeNormalize(mat3(gbufferModelViewInverse)*shadowLightPosition);
 float forward=pow(max(dot(ray,lightW),0.0),8.0);
 vec3 fog=linearColor(fogColor)*mix(0.45,0.9,dayAmount());
 fog=mix(fog,overcastRadiance()*0.8,weatherAmount());
 fog+=lightColor()*forward*0.025*celestialVisibility();
 return color*trans+fog*(1.0-trans);
}
#endif
