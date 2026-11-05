#ifndef AETHERIS_INDIRECT
#define AETHERIS_INDIRECT
float segmentVisibility(vec3 a,vec3 b){
 for(int i=1;i<=4;i++){
  vec3 q=mix(a,b,float(i)/5.0);if(q.z>=-near)return 0.0;
  vec2 uv=projectView(q);if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))return 0.0;
  float d=texture2D(depthtex0,safeUV(uv)).r;
  if(d<0.99999 && viewPosition(uv,d).z>q.z+0.12)return 0.0;
 }
 return 1.0;
}
vec3 screenIndirect(vec2 uv,vec3 p,vec3 n,vec3 albedo){
 vec3 sum=vec3(0);float rotation=hash12(floor(uv*vec2(viewWidth,viewHeight)))*2.0*PI;
 vec3 reference=abs(n.z)<0.9?vec3(0,0,1):vec3(0,1,0);
 vec3 t=safeNormalize(cross(reference,n)),b=cross(n,t);
 for(int i=0;i<GI_SAMPLES;i++){
  float index=(float(i)+0.5)/float(GI_SAMPLES),angle=rotation+float(i)*2.399963;
#if SSGI == 1
  vec3 direction=safeNormalize(t*cos(angle)*sqrt(index)+b*sin(angle)*sqrt(index)+n*sqrt(1.0-index));
  for(int stepIndex=1;stepIndex<=4;stepIndex++){
   float distanceV=0.15+float(stepIndex*stepIndex)*0.4;
   vec3 q=p+n*0.08+direction*distanceV;if(q.z>=-near)break;
   vec2 sampleUV=projectView(q);if(any(lessThan(sampleUV,vec2(0.001)))||any(greaterThan(sampleUV,vec2(0.999))))break;
   float d=texture2D(depthtex0,sampleUV).r;if(d>=0.99999)continue;
   vec3 hit=viewPosition(sampleUV,d);float crossing=hit.z-q.z;
   if(crossing>0.0 && crossing<0.7){
    vec3 hitN=safeNormalize(texture2D(colortex1,sampleUV).xyz*2.0-1.0);
    float emission=texture2D(colortex2,sampleUV).a;
#if COLORED_LIGHTS == 1
    if(emission>0.0)break; // don't count the explicit emissive gather twice
#endif
    vec3 incoming=min(texture2D(colortex3,sampleUV).rgb,vec3(4.0));
    sum+=incoming*albedo*max(dot(hitN,-direction),0.0)*GI_STRENGTH;
    break;
   }
  }
#endif
#if COLORED_LIGHTS == 1
  // Visible-emitter colored lighting. This is deliberately NOT labelled voxel GI.
  vec2 radius=vec2(gbufferProjection[0][0],gbufferProjection[1][1])*COLORED_RADIUS/max(-p.z,0.5)*0.5;
  vec2 lightUV=uv+vec2(cos(angle),sin(angle))*sqrt(index)*radius;
  if(all(greaterThan(lightUV,vec2(0.001)))&&all(lessThan(lightUV,vec2(0.999)))){
   float emission=texture2D(colortex2,lightUV).a;
   if(emission>0.0){
    vec3 source=viewPosition(lightUV,texture2D(depthtex0,lightUV).r),delta=source-p;
    float distance2=dot(delta,delta);
    if(distance2>0.04 && distance2<COLORED_RADIUS*COLORED_RADIUS){
     float visibility=segmentVisibility(p+n*0.08,source);
     vec3 sourceColor=texture2D(colortex15,lightUV).rgb*emission*EMISSIVE_BRIGHTNESS;
     sum+=albedo*sourceColor*max(dot(n,safeNormalize(delta)),0.0)*visibility*COLORED_STRENGTH*6.0/(1.0+distance2);
    }
   }
  }
#endif
 }
 return min(sum/float(GI_SAMPLES),vec3(2.0));
}
#endif
