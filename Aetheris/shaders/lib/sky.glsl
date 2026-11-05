#ifndef AETHERIS_SKY
#define AETHERIS_SKY
#include "/lib/scattering.glsl"
#include "/lib/clouds.glsl"
vec3 skyRadiance(vec3 ray,bool fullQuality,bool pointStars){
#ifdef AETHER_NETHER
 return mix(vec3(0.035,0.005,0.002),vec3(0.16,0.025,0.006),pow(1.0-abs(ray.y),3.0));
#elif defined(AETHER_END)
 vec2 coord=vec2(atan(ray.z,ray.x),asin(clamp(ray.y,-1.0,1.0)));
 float nebula=fbm(coord*5.0+frameTimeCounter*0.0008);
 float star=0.0;
 if(pointStars)star=step(0.9985,hash12(floor(coord*750.0)))*pow(max(0.0,1.0-length(fract(coord*750.0)-0.5)*2.0),8.0);
 return mix(vec3(0.006,0.003,0.018),vec3(0.10,0.025,0.16),pow(nebula,3.0))+vec3(0.4,0.35,0.6)*star;
#else
 vec3 sun=normalize(mat3(gbufferModelViewInverse)*sunPosition);float day=dayAmount(),h=saturate(ray.y);
 float celestial=celestialVisibility();
 float horizon=pow(1.0-abs(ray.y),5.0);float dusk=1.0-smoothstep(0.02,0.35,abs(sun.y));
 vec3 c=mix(vec3(0.004,0.008,0.024),mix(vec3(0.25,0.48,0.78),vec3(0.035,0.17,0.44),sqrt(h)),day);
#if ATMOSPHERE_QUALITY > 0
 vec3 night=vec3(0.004,0.008,0.024)*(1.0-day);
 vec3 scattered=scatteringFit(ray,sun);
#if ATMOSPHERE_QUALITY == 2
 if(fullQuality)scattered=singleScattering(ray,sun);
#endif
 c=night+scattered;
#else
 c+=vec3(0.8,0.17,0.055)*horizon*dusk*(0.4+0.6*max(dot(ray,sun),0.0));
#endif
 c=mix(c,overcastRadiance()*mix(1.12,0.65,h),weatherAmount());
 c+=sunlight()*pow(max(dot(ray,sun),0.0),600.0)*0.4*day*celestial;
 c+=vec3(10.0,8.0,5.0)*smoothstep(0.99982,0.99991,dot(ray,sun))*day*celestial;
 vec3 moon=normalize(mat3(gbufferModelViewInverse)*moonPosition);
 // Phase mask on the procedural moon disc, oriented in its local tangent plane.
 vec3 reference=abs(moon.y)>0.98?vec3(0,0,1):vec3(0,1,0);
 vec3 right=safeNormalize(cross(moon,reference));vec3 up=cross(right,moon);
 vec2 mc=vec2(dot(ray,right),dot(ray,up))/0.009;
 if(dot(ray,moon)>0.9999 && dot(mc,mc)<1.0){
 float z=sqrt(max(0.0,1.0-dot(mc,mc)));float phase=float(moonPhase)*PI/4.0;
 float lit=smoothstep(-0.04,0.04,z*cos(phase)+mc.x*sin(phase));c+=vec3(0.7,0.84,1.0)*lit*(1.0-day)*celestial;
 }
 vec2 starUV=vec2(atan(ray.z,ray.x),asin(clamp(ray.y,-1.0,1.0)))*700.0;
 float stars=0.0;
 if(pointStars)stars=step(0.998,hash12(floor(starUV)))*pow(max(0.0,1.0-length(fract(starUV)-0.5)*2.0),6.0);
 float band=pow(max(0.0,1.0-abs(dot(ray,normalize(vec3(0.3,0.8,0.5))))),24.0);
 c+=(vec3(stars)*1.8+vec3(0.012,0.014,0.025)*band*fbm(starUV*0.02))*(1.0-day)*celestial*smoothstep(0.0,0.2,ray.y);
 return sheetCloudSky(c,ray);
#endif
}
// Reflection environment deliberately omits unresolved point stars. Rotating a
// wave normal must not resample a sparse angular star grid into flashing pixels.
// Keep broad night radiance/nebula, the moon and sun; direct sky retains its stars.
vec3 reflectionSky(vec3 ray){return skyRadiance(ray,false,false);}
vec3 renderSky(vec3 ray){return skyRadiance(ray,true,true);}
#endif
