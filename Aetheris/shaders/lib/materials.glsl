#ifndef AETHERIS_MATERIALS
#define AETHERIS_MATERIALS
// LabPBR channel decoding (linear data, NOT gamma-corrected).
// R: perceptual smoothness, G: dielectric F0 or conductor ID,
// B: porosity / subsurface, A: emission with 255 reserved for no emission.
vec3 conductorF0(float id,vec3 albedo){
 if(id<230.5)return vec3(0.56,0.57,0.58);       // iron
 if(id<231.5)return vec3(1.0,0.766,0.336);      // gold
 if(id<232.5)return vec3(0.913,0.922,0.924);    // aluminium
 if(id<233.5)return vec3(0.550,0.556,0.554);    // chromium
 if(id<234.5)return vec3(0.955,0.638,0.538);    // copper
 if(id<235.5)return vec3(0.630,0.626,0.641);    // lead
 if(id<236.5)return vec3(0.673,0.637,0.585);    // platinum
 if(id<237.5)return vec3(0.972,0.960,0.915);    // silver
 return clamp(albedo,0.0,1.0); // unassigned IDs: generic albedo-tinted conductor
}
void decodeSpecular(vec4 data,vec3 albedo,inout float rough,inout float metal,
                    inout vec3 f0,inout float emission,out float porosity,inout float sss){
 porosity=0.0;
 bool mapped=max(data.r,max(data.g,data.b))>0.001 || (data.a>0.001 && data.a<0.998);
 if(!mapped)return; // neutral missing-map fallback: keep material-ID defaults
 sss=0.0;
 rough=max(0.08,1.0-data.r); // BRDF squares perceptual roughness to GGX alpha
 float id=floor(data.g*255.0+0.5);
 metal=step(229.5,id);f0=metal>0.5?conductorF0(id,albedo):vec3(data.g);
 float blue=floor(data.b*255.0+0.5);
 if(blue<=64.0)porosity=blue/64.0;else sss=(blue-65.0)/190.0;
 float alpha=floor(data.a*255.0+0.5);
 if(alpha<255.0)emission=max(emission,alpha/254.0);
}
#if LAB_PBR == 1
vec4 sampleMaterial(sampler2D mapTexture,vec2 coord,vec2 gx,vec2 gy){
#ifdef GL_ARB_shader_texture_lod
 return texture2DGradARB(mapTexture,coord,gx,gy);
#else
 return texture2D(mapTexture,coord);
#endif
}
// Derivative basis also works without a supplied tangent attribute on entities.
mat3 materialFrame(vec3 n,vec3 p,vec2 texcoord){
 vec3 px=dFdx(p),py=dFdy(p);vec2 tx=dFdx(texcoord),ty=dFdy(texcoord);
 float determinant=tx.x*ty.y-tx.y*ty.x;
 vec3 reference=abs(n.z)<0.9?vec3(0,0,1):vec3(0,1,0);
 vec3 t=safeNormalize(cross(reference,n));vec3 b=cross(n,t);
 if(abs(determinant)>1e-10){
  vec3 du=(px*ty.y-py*tx.y)/determinant;
  vec3 dv=(py*tx.x-px*ty.x)/determinant;
  t=safeNormalize(du-n*dot(n,du));
  b=safeNormalize(cross(n,t))*sign(dot(cross(n,t),dv));
 }
 return mat3(t,b,n);
}
vec3 mappedNormal(vec4 data,mat3 frame){
 vec2 xy=data.xy*2.0-1.0;float len2=dot(xy,xy);
 if(len2>=0.9999)return frame[2]; // reject invalid / missing normal-map texels
 vec3 normalT=vec3(xy*NORMAL_STRENGTH,sqrt(max(0.0,1.0-len2)));
 return safeNormalize(frame*normalT);
}
#if POM == 1 && defined(TERRAIN_PASS)
vec2 parallaxUV(vec2 texcoord,vec4 bounds,mat3 frame,vec3 viewDir,float distanceV,vec2 gx,vec2 gy){
 if(distanceV>=POM_DISTANCE)return texcoord;
 vec3 v=vec3(dot(viewDir,frame[0]),dot(viewDir,frame[1]),dot(viewDir,frame[2]));
 if(v.z<0.15)return texcoord;
 vec2 inset=0.5/max(vec2(atlasSize),vec2(1.0));
 if(any(lessThanEqual(bounds.zw,inset*1.1)))return texcoord;
 vec2 lo=bounds.xy-bounds.zw+inset,hi=bounds.xy+bounds.zw-inset;
 float firstHeight=sampleMaterial(normals,texcoord,gx,gy).a;
 if(firstHeight<=0.001 || firstHeight>=0.999)return texcoord;
 float fade=1.0-smoothstep(POM_DISTANCE*0.65,POM_DISTANCE,distanceV);
 vec2 shift=-v.xy/max(v.z,0.15)*POM_DEPTH*fade*(bounds.zw*2.0);
 vec2 previous=texcoord;float previousDelta=-(1.0-firstHeight);
 for(int i=1;i<=POM_STEPS;i++){
  float layer=float(i)/float(POM_STEPS);vec2 current=clamp(texcoord+shift*layer,lo,hi);
  float delta=layer-(1.0-sampleMaterial(normals,current,gx,gy).a);
  if(delta>=0.0){float blend=delta/max(delta-previousDelta,1e-5);return mix(current,previous,clamp(blend,0.0,1.0));}
  previous=current;previousDelta=delta;
 }
 return previous;
}
#endif
#endif
#endif
