#version 120
#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/shadows.glsl"
#include "/lib/sky.glsl"
#include "/lib/lighting.glsl"
varying vec2 uv;
/* DRAWBUFFERS:0 */
void main(){
 vec3 c=texture2D(colortex0,uv).rgb;float d=texture2D(depthtex0,uv).r;
 vec3 p=viewPosition(uv,d);vec4 mat=texture2D(colortex2,uv);vec4 nr=texture2D(colortex1,uv);
 vec3 n=normalize(nr.xyz*2.0-1.0);float water=step(0.5,mat.g);
#if REFLECTION_STEPS > 0
 if(d<0.99999 && (water>0.5 || nr.a<0.45)){
 vec3 ray=reflect(normalize(p),n),hit=atmosphere(normalize(mat3(gbufferModelViewInverse)*ray));
 vec3 q=p+n*0.12;float found=0.0;
 for(int i=0;i<REFLECTION_STEPS;i++){
 q+=ray*(0.25+float(i)*0.11);if(q.z>-near)break;
 vec2 t=projectView(q);if(any(lessThan(t,vec2(0.002)))||any(greaterThan(t,vec2(0.998))))break;
 float z=texture2D(depthtex1,t).r;vec3 scene=viewPosition(t,z);float diff=scene.z-q.z;
 if(z<0.99999 && diff>0.0 && diff<0.35+float(i)*0.06){float edge=smoothstep(0.0,0.12,min(min(t.x,t.y),min(1.0-t.x,1.0-t.y)));hit=mix(hit,texture2D(colortex3,t).rgb,edge);found=1.0;break;}
 }
 float f=0.02+0.98*pow(1.0-saturate(dot(n,normalize(-p))),5.0);
 if(water>0.5){
 vec2 refr=clamp(uv+n.xy*0.012,vec2(0.001),vec2(0.999));
 if(texture2D(depthtex1,refr).r<d)refr=uv;
 float thickness=min(30.0,length(viewPosition(refr,texture2D(depthtex1,refr).r)-p));
 vec3 trans=exp(-vec3(0.22,0.065,0.045)*thickness);vec3 under=texture2D(colortex3,refr).rgb*trans+vec3(0.015,0.09,0.11)*(1.0-trans);
 c=mix(under,hit,f)+c*0.15;
 }else{vec3 F=fresnel(dot(n,normalize(-p)),mix(vec3(0.04),vec3(0.65),mat.r));c=mix(c,hit,F*(1.0-nr.a)*mat.b);}
 }
#endif
#if VOLUMETRIC_STEPS > 0
 float maxLen=min(length(p),96.0),scatter=0.0;vec3 worldRay=normalize(worldRelative(p)-worldRelative(vec3(0)));
 for(int i=0;i<VOLUMETRIC_STEPS;i++){float t=(float(i)+hash12(uv+float(i)))/float(VOLUMETRIC_STEPS);vec3 wp=worldRelative(normalize(p)*maxLen*t);scatter+=shadowVisibility(wp,vec3(0,1,0));}
 float phase=0.08+pow(max(dot(normalize(p),normalize(shadowLightPosition)),0.0),12.0);
 c+=lightColor()*scatter/float(VOLUMETRIC_STEPS)*phase*(1.0-exp(-maxLen*0.018))*VOLUMETRIC_STRENGTH;
#endif
 gl_FragData[0]=vec4(c,1);
}
