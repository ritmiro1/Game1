#ifndef AETHERIS_LIGHTING
#define AETHERIS_LIGHTING
// Energy-conserving GGX microfacet BRDF with Schlick Fresnel and Smith masking.
vec3 fresnel(float v,vec3 f0){return f0+(1.0-f0)*pow(1.0-saturate(v),5.0);}
vec3 brdf(vec3 albedo,vec3 n,vec3 v,vec3 l,float rough,float metal){
 vec3 h=safeNormalize(v+l);rough=clamp(rough,0.08,1.0);float nl=saturate(dot(n,l)),nv=max(dot(n,v),0.001),nh=saturate(dot(n,h));
 float a=rough*rough,a2=a*a,d=nh*nh*(a2-1.0)+1.0;
 float D=a2/max(PI*d*d,0.00001),k=(rough+1.0)*(rough+1.0)/8.0;
 float G=nv/(nv*(1.0-k)+k)*nl/(nl*(1.0-k)+k);
 vec3 F=fresnel(dot(v,h),mix(vec3(0.04),albedo,metal));
 return ((1.0-F)*(1.0-metal)*albedo/PI+F*D*G/max(4.0*nv*nl,0.001))*nl;
}
vec3 shadeSurface(vec3 albedo,vec3 n,vec3 vp,vec2 lm,float rough,float metal,float emissive,float noShadow){
 vec3 wp=worldRelative(vp),wn=normalize(mat3(gbufferModelViewInverse)*n);
 float visibility=mix(shadowVisibility(wp,wn),1.0,noShadow);
 vec3 direct=brdf(albedo,n,safeNormalize(-vp),safeNormalize(shadowLightPosition),rough,metal)*lightColor()*visibility*saturate(lm.y*16.0);
 float sky=pow(saturate(lm.y),2.2);
 vec3 ambient=mix(vec3(0.009,0.016,0.032)*NIGHT_BRIGHTNESS,vec3(0.13,0.20,0.30),dayAmount())*(1.0-0.35*rainStrength);
 ambient*=mix(0.55,1.05,saturate(wn.y*0.5+0.5))*sky;
 // Low-energy ground bounce, gated by sky access to avoid glowing caves.
 ambient+=vec3(0.025,0.018,0.010)*dayAmount()*sky*(1.0-saturate(wn.y));
 // Vanilla propagated block light provides local illumination; not dynamic colored point lights.
 float held=float(max(heldBlockLightValue,heldBlockLightValue2))/15.0;
 float torch=max(pow(saturate(lm.x),3.0),held*pow(saturate(1.0-length(vp)/12.0),2.0));
 vec3 block=vec3(1.0,0.56,0.23)*torch*0.9;
 vec3 c=direct+albedo*(ambient+block+0.0025)+albedo*emissive*EMISSIVE_BRIGHTNESS;
 float fog=isEyeInWater==1?0.0:1.0-exp(-length(vp)*(0.00035+rainStrength*0.002));
 return mix(c,linearColor(fogColor)*0.7,fog);
}
#endif
