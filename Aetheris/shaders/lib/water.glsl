#ifndef AETHERIS_WATER
#define AETHERIS_WATER
float wave(vec2 p){float t=frameTimeCounter;float w=sin(dot(p,vec2(0.8,0.6))*1.5+t*1.2)*0.035;
#if WATER_QUALITY > 1
 w+=sin(dot(p,vec2(-0.4,0.9))*3.2-t*1.6)*0.018;
#endif
#if WATER_QUALITY > 2
 w+=(aetherNoise(p*5.0+t*0.4)-0.5)*0.025;
#endif
 return w;}
vec3 waveNormal(vec3 p,vec3 n){vec2 x=p.xz;float w=wave(x);return normalize(n+vec3((w-wave(x+vec2(0.04,0)))*4.0,0,(w-wave(x+vec2(0,0.04)))*4.0));}
#endif
