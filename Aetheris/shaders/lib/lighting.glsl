#ifndef AETHERIS_LIGHTING
#define AETHERIS_LIGHTING
// Energy-conserving GGX microfacet BRDF with Schlick Fresnel and Smith masking.
vec3 fresnel(float v,vec3 f0){return f0+(1.0-f0)*pow(1.0-saturate(v),5.0);}
vec3 brdf(vec3 albedo,vec3 n,vec3 v,vec3 l,float rough,float metal){
 vec3 h=normalize(v+l);float nl=saturate(dot(n,l)),nv=max(dot(n,v),0.001),nh=saturate(dot(n,h));
 float a=rough*rough,a2=a*a,d=nh*nh*(a2-1.0)+1.0;
 float D=a2/max(PI*d*d,0.00001),k=(rough+1.0)*(rough+1.0)/8.0;
 float G=nv/(nv*(1.0-k)+k)*nl/(nl*(1.0-k)+k);
 vec3 F=fresnel(dot(v,h),mix(vec3(0.04),albedo,metal));
 return ((1.0-F)*(1.0-metal)*albedo/PI+F*D*G/max(4.0*nv*nl,0.001))*nl;
}
vec3 shadeSurface(vec3 albedo,vec3 n,vec3 vp,vec2 lm,float rough,float metal,float emissive,float noShadow){
 vec3 wp=worldRelative(vp),wn=normalize(mat3(gbufferModelViewInverse)*n);
 float visibility=mix(shadowVisibility(wp,wn),1.0,noShadow);
 vec3 direct=brdf(albedo,n,normalize(-vp),normalize(shadowLightPosition),rough,metal)*lightColor()*visibility*saturate(lm.y*16.0);
 float sky=pow(saturate(lm.y),2.0);
 vec3 ambient=mix(vec3(0.018,0.026,0.05),vec3(0.16,0.23,0.34),dayAmount());
 ambient*=mix(0.5,1.0,wn.y*0.5+0.5)*sky;
 // Vanilla propagated block light provides local illumination; not dynamic colored point lights.
 float held=float(max(heldBlockLightValue,heldBlockLightValue2))/15.0;
 float torch=max(pow(saturate(lm.x),3.0),held*pow(saturate(1.0-length(vp)/12.0),2.0));
 vec3 block=vec3(1.0,0.56,0.23)*torch*0.9;
 vec3 c=direct+albedo*(ambient+block+0.008)+albedo*emissive*EMISSIVE_BRIGHTNESS;
 float fog=1.0-exp(-length(vp)*(isEyeInWater==1?0.045:0.00035+rainStrength*0.002));
 return mix(c,isEyeInWater==1?vec3(0.015,0.12,0.16):linearColor(fogColor)*0.7,fog);
}
#endif
