#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/shadows.glsl"
#include "/lib/lighting.glsl"
#include "/lib/water.glsl"
varying vec2 uv,lm;
varying vec4 tint;
varying vec3 normalV,positionV,positionW;
varying float material;
/* DRAWBUFFERS:012 */
void main(){
 vec4 tex=texture2D(texture,uv)*tint;
 if(tex.a<0.1)discard;
#ifdef ENTITY_PASS
 tex.rgb=mix(tex.rgb,entityColor.rgb,entityColor.a);
#endif
 vec3 albedo=linearColor(tex.rgb);vec3 n=normalize(normalV);
 float metal=step(10019.5,material)*step(material,10020.5),rough=mix(0.82,0.24,metal);
 float emissive=0.0;
 if(material==10010.0||material==10011.0)emissive=1.0;
 if(material==10012.0)emissive=0.4;
 float water=0.0;
#ifdef WATER_PASS
 water=1.0-step(0.5,abs(material-10001.0));
 if(water>0.5){vec3 wn=normalize(mat3(gbufferModelViewInverse)*n);wn=waveNormal(positionW,wn);n=normalize(mat3(gbufferModelView)*wn);rough=0.12;albedo=mix(albedo,vec3(0.025,0.12,0.14),0.8);tex.a=0.82;}
#endif
 float wet=wetness*lm.y*max(0.0,(mat3(gbufferModelViewInverse)*n).y)*(1.0-water);
 rough=mix(rough,0.18,wet*0.75);albedo*=1.0-wet*0.22;
 float noShadow=0.0;
#ifdef HAND_PASS
 noShadow=1.0;
#endif
 vec3 color=shadeSurface(albedo,n,positionV,lm,rough,metal,emissive,noShadow);
#ifdef WEATHER_PASS
 color=mix(color,linearColor(tex.rgb)*(0.1+dayAmount()*0.5),0.7);tex.a*=0.65;
#endif
 gl_FragData[0]=vec4(color,tex.a);
 gl_FragData[1]=vec4(n*0.5+0.5,rough);
 gl_FragData[2]=vec4(metal,water,lm.y,emissive);
}
