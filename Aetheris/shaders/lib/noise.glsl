#ifndef AETHERIS_NOISE
#define AETHERIS_NOISE
float hash12(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float aetherNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x),mix(hash12(i+vec2(0,1)),hash12(i+1.0),f.x),f.y);}
float fbm(vec2 p){return aetherNoise(p)*0.57+aetherNoise(p*2.03)*0.28+aetherNoise(p*4.07)*0.15;}
#endif
