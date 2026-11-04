#ifndef AETHERIS_WATER
#define AETHERIS_WATER
// Analytic gradients avoid finite-difference cancellation and keep waves smooth.
vec3 waveNormal(vec3 p,vec3 n,float distanceV){
 vec2 x=mod(p.xz,vec2(4096.0));float t=mod(frameTimeCounter,4096.0);
 vec2 d0=vec2(0.8,0.6),d1=vec2(-0.4,0.916515),d2=vec2(0.95,-0.31225);
 vec2 slope=d0*cos(dot(x,d0)*1.5+t*1.2)*0.0525;
#if WATER_QUALITY > 1
 slope+=d1*cos(dot(x,d1)*3.2-t*1.6)*0.0576*(1.0-smoothstep(24.0,96.0,distanceV));
#endif
#if WATER_QUALITY > 2
 slope+=d2*cos(dot(x,d2)*6.0+t*2.1)*0.03*(1.0-smoothstep(8.0,40.0,distanceV));
#endif
 float top=smoothstep(0.4,0.9,abs(n.y));
 return safeNormalize(n-vec3(slope.x,0.0,slope.y)*top*sign(n.y));
}
float waterFresnel(float cosineV,bool underwater){
 // Air/water IOR; use Snell's law for total internal reflection when submerged.
 float eta=underwater?1.333:1.0/1.333;
 float sin2=eta*eta*max(0.0,1.0-cosineV*cosineV);
 if(sin2>=1.0)return 1.0;
 float ct=sqrt(max(0.0,1.0-sin2));
 float rs=(eta*cosineV-ct)/max(eta*cosineV+ct,1e-5);
 float rp=(cosineV-eta*ct)/max(cosineV+eta*ct,1e-5);
 return saturate((rs*rs+rp*rp)*0.5);
}
vec3 waterTransmission(float distanceV){return exp(-vec3(0.22,0.065,0.045)*clamp(distanceV,0.0,64.0)*WATER_ABSORPTION);}
#endif
