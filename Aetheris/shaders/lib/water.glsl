#ifndef AETHERIS_WATER
#define AETHERIS_WATER
// Pixel-footprint filtering is evaluated in the fragment caller, never in vertices.
// Integer Fourier wavevectors keep mod-4096 wrapping continuous at world seams.
vec2 periodicWaterVector(vec2 k){return floor(k*(4096.0/(2.0*PI))+0.5)*(2.0*PI/4096.0);}
vec2 filteredWaveSlope(vec2 x,vec2 direction,float frequency,float time,float height,vec2 dx,vec2 dy){
 vec2 k=periodicWaterVector(direction*frequency);
 vec2 warpK=periodicWaterVector(vec2(-direction.y,direction.x)*0.31);
 float warp=dot(x,warpK)+time*0.27;
 float phase=dot(x,k)+time+0.6*sin(warp);
 vec2 gradient=k+warpK*0.6*cos(warp);
 vec2 footprint=vec2(dot(gradient,dx),dot(gradient,dy));
 float filterWeight=exp(-0.5*dot(footprint,footprint));
 return gradient*(height*cos(phase)*filterWeight);
}
vec3 waveNormal(vec3 p,vec3 n,vec2 dx,vec2 dy){
 vec2 x=mod(p.xz,vec2(4096.0));float t=mod(frameTimeCounter,4096.0);
 vec2 slope=filteredWaveSlope(x,vec2(0.8,0.6),1.12,t*1.05,0.021,dx,dy);
 slope+=filteredWaveSlope(x,vec2(-0.937,0.349),0.63,-t*0.73,0.030,dx,dy);
#if WATER_QUALITY > 1
 slope+=filteredWaveSlope(x,vec2(-0.4,0.916515),2.03,-t*1.37,0.009,dx,dy);
#endif
#if WATER_QUALITY > 2
 slope+=filteredWaveSlope(x,vec2(0.95,-0.31225),3.9,t*1.83,0.003,dx,dy);
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
// Procedural light-focusing approximation, not refractive ray tracing.
float causticPattern(vec3 worldP){
 vec2 p=mod(worldP.xz,vec2(4096.0));float time=frameTimeCounter*0.45;
 float a=abs(sin(p.x*2.8+sin(p.y*1.7+time)+time));
 float b=abs(sin(p.y*3.1+sin(p.x*1.4-time)-time));
 return pow(max(0.0,1.0-min(a,b)),8.0);
}
float shoreFoam(vec3 worldP,float thickness){
 float edge=1.0-smoothstep(0.08,0.8,thickness);
 float breakup=0.5+0.5*aetherNoise(worldP.xz*3.0+frameTimeCounter*0.3);
 return edge*breakup*FOAM_STRENGTH;
}
#endif
