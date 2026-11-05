#ifndef AETHERIS_LIGHTING
#define AETHERIS_LIGHTING
#include "/lib/fog.glsl"
// Energy-conserving GGX microfacet BRDF with Schlick Fresnel and Smith masking.
vec3 fresnel(float v,vec3 f0){return f0+(1.0-f0)*pow(1.0-saturate(v),5.0);}
vec3 brdf(vec3 albedo,vec3 n,vec3 v,vec3 l,float rough,float metal,vec3 f0){
 vec3 h=safeNormalize(v+l);rough=clamp(rough,0.08,1.0);float nl=saturate(dot(n,l)),nv=max(dot(n,v),0.001),nh=saturate(dot(n,h));
 float a=rough*rough,a2=a*a,d=nh*nh*(a2-1.0)+1.0;
 float D=a2/max(PI*d*d,0.00001),k=(rough+1.0)*(rough+1.0)/8.0;
 float G=nv/(nv*(1.0-k)+k)*nl/(nl*(1.0-k)+k);
 vec3 F=fresnel(dot(v,h),f0);
 return ((1.0-F)*(1.0-metal)*albedo/PI+F*D*G/max(4.0*nv*nl,0.001))*nl;
}
vec3 shadeSurface(vec3 albedo,vec3 n,vec3 geometricN,vec3 vp,vec2 lm,float rough,float metal,vec3 f0,float emissive,float ambientAO,float sss,float noShadow){
 vec3 wp=worldRelative(vp),wn=safeNormalize(mat3(gbufferModelViewInverse)*n);
 vec3 lightV=primaryLightDirectionV();float nl=dot(n,lightV);
 vec3 visibility=vec3(1.0);float skyAccess=smoothstep(0.02,0.10,lm.y);
 // Skip all blocker/PCF reads on hands, backfaces and surfaces without sky access.
 if(noShadow<0.5 && lm.y>0.02 && (nl>0.0||sss>0.0))
  visibility=shadowTransmission(wp,safeNormalize(mat3(gbufferModelViewInverse)*geometricN));
 vec3 direct=brdf(albedo,n,safeNormalize(-vp),lightV,rough,metal,f0)*lightColor()*visibility*skyAccess;
 direct+=albedo*sss*0.25*max(-nl,0.0)*lightColor()*visibility*pow(saturate(lm.y),2.0);
#ifdef AETHER_NETHER
 vec3 dimensionAmbient=vec3(0.035,0.010,0.004);
#elif defined(AETHER_END)
 vec3 dimensionAmbient=vec3(0.025,0.020,0.055);
#else
 vec3 dimensionAmbient=vec3(0.0);
#endif
 float sky=pow(saturate(lm.y),2.2);
 vec3 ambient=mix(vec3(0.009,0.016,0.032)*NIGHT_BRIGHTNESS,vec3(0.13,0.20,0.30),dayAmount());
 ambient=mix(ambient,overcastRadiance()*0.9,weatherAmount());
 float hemisphere=saturate(wn.y*0.5+0.5);
 ambient*=mix(mix(0.55,1.05,hemisphere),mix(0.8,1.0,hemisphere),weatherAmount())*sky;
 // Low-energy ground bounce, gated by sky access to avoid glowing caves.
 ambient+=vec3(0.025,0.018,0.010)*dayAmount()*sky*(1.0-saturate(wn.y));
 // Vanilla propagated block light provides local illumination; not dynamic colored point lights.
 float held=float(max(heldBlockLightValue,heldBlockLightValue2))/15.0;
 float torch=max(pow(saturate((lm.x-0.03125)/0.9375),1.65),held*pow(saturate(1.0-length(vp)/12.0),2.0));
 vec3 blockColor=mix(vec3(0.90,0.94,1.0),vec3(1.0,0.58,0.25),BLOCK_LIGHT_WARMTH);
 vec3 block=blockColor*torch*BLOCK_LIGHT_STRENGTH;
 // Deliberate artistic readability floor, NOT bounced/voxel light. Zero restores darkness.
 vec3 caveFill=vec3(0.014,0.015,0.017)*CAVE_BRIGHTNESS*(1.0-sky);
 vec3 c=direct+albedo*((ambient+dimensionAmbient+caveFill)*ambientAO+block)+albedo*emissive*EMISSIVE_BRIGHTNESS;
 return aerialFog(c,vp,lm.y);
}
#endif
