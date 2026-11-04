#ifndef AETHERIS_SHADOWS
#define AETHERIS_SHADOWS
vec3 distortShadow(vec3 p){p.xy/=0.15+length(p.xy)*0.85;p.z*=0.2;return p;}
float cloudShadow(vec3 p){
#if CLOUD_QUALITY > 0
return mix(1.0,0.62,smoothstep(0.48,0.72,fbm((p.xz+cameraPosition.xz)*0.0015+frameTimeCounter*0.002)))*(1.0-0.12*rainStrength);
#else
return 1.0;
#endif
}
float shadowVisibility(vec3 p,vec3 n){
 vec4 q=shadowProjection*shadowModelView*vec4(p+n*0.035,1.0);
 vec3 t=distortShadow(q.xyz/q.w)*0.5+0.5;
 if(any(lessThan(t,vec3(0.002)))||any(greaterThan(t,vec3(0.998))))return 1.0;
 float result=0.0;
 for(int i=0;i<SHADOW_SAMPLES;i++){
 float a=float(i)*2.399963;vec2 disk=vec2(cos(a),sin(a))*sqrt((float(i)+0.5)/float(SHADOW_SAMPLES));
 float z=texture2D(shadowtex0,t.xy+disk*1.75/float(shadowMapResolution)).r;
 result+=step(t.z-0.00065,z);
 }
 float edge=smoothstep(shadowDistance*0.7,shadowDistance,length(p));
 return mix(result/float(SHADOW_SAMPLES),1.0,edge)*cloudShadow(p);
}
#endif
