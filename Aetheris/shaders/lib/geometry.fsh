#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/shadows.glsl"
#include "/lib/lighting.glsl"
#include "/lib/water.glsl"
#include "/lib/materials.glsl"
#include "/lib/puddles.glsl"
varying vec2 uv,lm;
varying vec4 tint;
varying vec3 normalV,positionV,positionW;
varying float material;
#ifdef AETHER_VELOCITY_ACTIVE
varying vec4 previousClip;
#endif
#if LAB_PBR == 1 && POM == 1 && defined(TERRAIN_PASS)
varying vec4 tileBounds;
#endif
// RENDERTARGETS accepts attachment indices 10..15; GLSL output slots stay < 8.
#if defined(AETHER_VELOCITY_ACTIVE) && defined(AETHER_GI_ACTIVE)
/* RENDERTARGETS:0,1,2,7,8,15 */
#define VELOCITY_TARGET 4
#define ALBEDO_TARGET 5
#elif defined(AETHER_VELOCITY_ACTIVE)
/* RENDERTARGETS:0,1,2,7,8 */
#define VELOCITY_TARGET 4
#elif defined(AETHER_GI_ACTIVE)
/* RENDERTARGETS:0,1,2,7,15 */
#define ALBEDO_TARGET 4
#else
/* RENDERTARGETS:0,1,2,7 */
#endif
void main(){
 // Unconditional quad derivatives: safe before divergent water/front-face branches.
 vec2 waterDx=dFdx(positionW.xz),waterDy=dFdy(positionW.xz);
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
 float metal=step(10019.5,material)*step(material,10022.5),rough=0.82;
 vec3 f0=vec3(0.04);
 if(material==10020.0){rough=0.32;f0=vec3(0.56,0.57,0.58);}
 if(material==10021.0){rough=0.28;f0=vec3(0.98,0.77,0.34);}
 if(material==10022.0){rough=0.38;f0=vec3(0.95,0.64,0.54);}
 if(material==10023.0){rough=0.22;f0=vec3(0.12);}
 float glass=material==10030.0||material==10031.0?1.0:0.0;
 if(glass>0.5){rough=0.12;f0=vec3(0.04);if(!gl_FrontFacing)n=-n;}
 float emissive=0.0,ambientAO=1.0,porosity=mix(0.35,0.0,metal),sss=material==10003.0?0.15:0.0;
 if(material==10010.0)emissive=1.0;
 if(material==10011.0)emissive=0.8; // gentler neutral/cool emitter surfaces, not a lightmap source classification
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
  n=safeNormalize(mat3(gbufferModelView)*waveNormal(positionW,wn,waterDx,waterDy));
  rough=0.12;f0=vec3(0.02037);albedo=mix(albedo,vec3(0.025,0.12,0.14),0.8);tex.a=0.82;
 }
#endif
 float wet=wetness*lm.y*max(0.0,(mat3(gbufferModelViewInverse)*geometricN).y)*(1.0-water);
#if defined(AETHER_NETHER) || defined(AETHER_END)
 wet=0.0;
#endif
 float film=wet*(1.0-porosity*0.85);
 rough=mix(rough,max(0.20,rough*0.65),film*0.7);albedo*=1.0-wet*(0.12+porosity*0.22);
#if PUDDLES == 1
 if(water<0.5 && glass<0.5 && metal<0.5 && material!=10003.0){
  vec3 worldN=safeNormalize(mat3(gbufferModelViewInverse)*n);
  float puddle=puddleCoverage(positionW,worldN,lm.y,porosity);
  n=safeNormalize(mat3(gbufferModelView)*puddleNormal(positionW,worldN,puddle));
  rough=mix(rough,0.08,puddle);f0=mix(f0,vec3(0.02037),puddle*0.6);albedo*=1.0-puddle*0.15;
 }
#endif
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
 float marker=noShadow>0.5?-1.0:emissive;
#ifdef ENTITY_PASS
 marker= -2.0; // Unknown animation: reject history instead of inventing entity velocity.
#endif
 gl_FragData[2]=vec4(metal,water+glass*2.0,lm.y,marker);
#ifdef AETHER_VELOCITY_ACTIVE
 vec4 motion=vec4(0);
#if !defined(HAND_PASS) && !defined(ENTITY_PASS) && !defined(WEATHER_PASS)
 if(water<0.5 && previousClip.w>0.0){
  vec2 oldUV=previousClip.xy/previousClip.w*0.5+0.5+temporalJitter(frameCounter-1);
  motion=vec4(oldUV-gl_FragCoord.xy/vec2(viewWidth,viewHeight),min(previousClip.w,32000.0),1.0);
 }
#endif
 gl_FragData[VELOCITY_TARGET]=motion;
#endif
#ifdef AETHER_GI_ACTIVE
 gl_FragData[ALBEDO_TARGET]=vec4(clamp(albedo,0.0,1.0),porosity);
#endif
gl_FragData[3]=vec4(clamp(f0,0.0,1.0),ambientAO);
}
