#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/shadows.glsl"
#include "/lib/lighting.glsl"
#include "/lib/water.glsl"
#include "/lib/materials.glsl"
varying vec2 uv,lm;
varying vec4 tint;
varying vec3 normalV,positionV,positionW;
varying float material;
#if LAB_PBR == 1 && POM == 1 && defined(TERRAIN_PASS)
varying vec4 tileBounds;
#endif
#if LAB_PBR == 1
/* DRAWBUFFERS:0127 */
#else
/* DRAWBUFFERS:012 */
#endif
void main(){
 vec3 geometricN=safeNormalize(normalV);vec2 sampleUV=uv;
#if LAB_PBR == 1 && !defined(WEATHER_PASS) && !defined(WATER_PASS)
 // Derivatives are evaluated before texture alpha discard and before ray-march divergence.
 vec2 gradX=dFdx(uv),gradY=dFdy(uv);
 mat3 frame=materialFrame(geometricN,positionV,uv);
#if POM == 1 && defined(TERRAIN_PASS)
 if(material!=10003.0)sampleUV=parallaxUV(uv,tileBounds,frame,safeNormalize(-positionV),length(positionV),gradX,gradY);
#endif
#endif
 #if LAB_PBR == 1 && !defined(WEATHER_PASS) && !defined(WATER_PASS)
 vec4 tex=sampleMaterial(texture,sampleUV,gradX,gradY)*tint;
#else
 vec4 tex=texture2D(texture,sampleUV)*tint;
#endif
 if(tex.a<0.1)discard;
#ifdef ENTITY_PASS
 tex.rgb=mix(tex.rgb,entityColor.rgb,entityColor.a);
#endif
 vec3 albedo=linearColor(tex.rgb),n=geometricN;
 float metal=step(10019.5,material)*step(material,10020.5),rough=mix(0.82,0.24,metal);
 vec3 f0=mix(vec3(0.04),albedo,metal);
 float emissive=0.0,ambientAO=1.0,porosity=0.0,sss=material==10003.0?0.15:0.0;
 if(material==10010.0||material==10011.0)emissive=1.0;
 if(material==10012.0)emissive=0.4;
#if LAB_PBR == 1 && !defined(WEATHER_PASS) && !defined(WATER_PASS)
 vec4 normalData=sampleMaterial(normals,sampleUV,gradX,gradY);
 n=mappedNormal(normalData,frame);
 if(dot(normalData.rg*2.0-1.0,normalData.rg*2.0-1.0)<0.9999)ambientAO=normalData.b;
 decodeSpecular(sampleMaterial(specular,sampleUV,gradX,gradY),albedo,rough,metal,f0,emissive,porosity,sss);
#endif
 float water=0.0;
#ifdef WATER_PASS
 water=1.0-step(0.5,abs(material-10001.0));
 if(water>0.5){
  if(!gl_FrontFacing)n=-n;
  vec3 wn=safeNormalize(mat3(gbufferModelViewInverse)*n);
  n=safeNormalize(mat3(gbufferModelView)*waveNormal(positionW,wn,length(positionV)));
  rough=0.12;f0=vec3(0.02037);albedo=mix(albedo,vec3(0.025,0.12,0.14),0.8);tex.a=0.82;
 }
#endif
 float wet=wetness*lm.y*max(0.0,(mat3(gbufferModelViewInverse)*geometricN).y)*(1.0-water);
 rough=mix(rough,0.18,wet*0.75);albedo*=1.0-wet*(0.22+porosity*0.25);
 float noShadow=0.0;
#ifdef HAND_PASS
 noShadow=1.0;
#endif
 vec3 color=shadeSurface(albedo,n,geometricN,positionV,lm,rough,metal,f0,emissive,ambientAO,sss,noShadow);
#ifdef WEATHER_PASS
 color=mix(color,linearColor(tex.rgb)*(0.1+dayAmount()*0.5),0.7);tex.a*=0.65;
#endif
 gl_FragData[0]=vec4(color,tex.a);
 gl_FragData[1]=vec4(n*0.5+0.5,rough);
 gl_FragData[2]=vec4(metal,water,lm.y,noShadow>0.5?-1.0:emissive);
#if LAB_PBR == 1
 gl_FragData[3]=vec4(clamp(f0,0.0,1.0),ambientAO);
#endif
}
