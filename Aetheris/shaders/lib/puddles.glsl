#ifndef AETHERIS_PUDDLES
#define AETHERIS_PUDDLES
float puddleCoverage(vec3 worldP,vec3 worldN,float skyAccess,float porosity){
#if PUDDLES == 1 && !defined(AETHER_NETHER) && !defined(AETHER_END)
 float availability=saturate(wetness*PUDDLE_AMOUNT)*(1.0-porosity*0.9);
 float field=fbm(worldP.xz*0.12);
 float threshold=mix(0.95,0.30,availability);
 return smoothstep(threshold,threshold+0.10,field)*smoothstep(0.85,0.98,worldN.y)*pow(saturate(skyAccess),3.0);
#else
 return 0.0;
#endif
}
vec3 puddleNormal(vec3 worldP,vec3 worldN,float coverage){
 vec2 p=worldP.xz*8.0;float t=frameTimeCounter*3.0;
 vec2 ripple=vec2(sin(p.x+p.y+t),cos(p.x-p.y-t))*0.018*rainStrength;
 return safeNormalize(mix(worldN,vec3(0,1,0),coverage*0.9)+vec3(ripple.x,0,ripple.y)*coverage);
}
#endif
