#ifndef AETHERIS_SKY
#define AETHERIS_SKY
vec3 atmosphere(vec3 ray){
 vec3 sun=normalize(mat3(gbufferModelViewInverse)*sunPosition);float day=dayAmount(),h=saturate(ray.y);
 float horizon=pow(1.0-abs(ray.y),5.0);float dusk=1.0-smoothstep(0.02,0.35,abs(sun.y));
 vec3 c=mix(vec3(0.004,0.008,0.024),mix(vec3(0.25,0.48,0.78),vec3(0.035,0.17,0.44),sqrt(h)),day);
 c+=vec3(0.8,0.17,0.055)*horizon*dusk*(0.4+0.6*max(dot(ray,sun),0.0));
 c+=sunlight()*pow(max(dot(ray,sun),0.0),600.0)*0.4*day;
 c+=vec3(10.0,8.0,5.0)*smoothstep(0.99982,0.99991,dot(ray,sun))*day;
 vec3 moon=normalize(mat3(gbufferModelViewInverse)*moonPosition);
 // Phase mask on the procedural moon disc, oriented in its local tangent plane.
 vec3 right=normalize(cross(moon,vec3(0,1,0)));vec3 up=cross(right,moon);
 vec2 mc=vec2(dot(ray,right),dot(ray,up))/0.009;
 if(dot(ray,moon)>0.9999 && dot(mc,mc)<1.0){
 float z=sqrt(max(0.0,1.0-dot(mc,mc)));float phase=float(moonPhase)*PI/4.0;
 float lit=smoothstep(-0.04,0.04,z*cos(phase)+mc.x*sin(phase));c+=vec3(0.7,0.84,1.0)*lit*(1.0-day);
 }
 vec2 starUV=vec2(atan(ray.z,ray.x),asin(clamp(ray.y,-1.0,1.0)))*700.0;
 float stars=step(0.998,hash12(floor(starUV)))*pow(max(0.0,1.0-length(fract(starUV)-0.5)*2.0),6.0);
 float band=pow(max(0.0,1.0-abs(dot(ray,normalize(vec3(0.3,0.8,0.5))))),24.0);
 c+=(vec3(stars)*1.8+vec3(0.012,0.014,0.025)*band*fbm(starUV*0.02))*(1.0-day)*smoothstep(0.0,0.2,ray.y);
 return mix(c,vec3(dot(c,vec3(0.25,0.6,0.15)))*0.6,rainStrength*0.8);
}
#endif
