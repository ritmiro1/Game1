#include "/lib/common.glsl"
varying vec2 uv;varying vec4 tint;varying float material;
/* DRAWBUFFERS:0 */
void main(){
 vec4 c=texture2D(texture,uv)*tint;
 if(c.a<0.01||material==10001.0)discard;
 if(material==10031.0){gl_FragData[0]=vec4(0,0,0,1);return;}
 if(material==10030.0){
#if COLORED_SHADOWS == 1
  // Store linear transmittance, NOT a second lit copy of the glass.
  vec3 trans=exp(-(1.0-linearColor(c.rgb))*SHADOW_TINT_STRENGTH*3.0);
  gl_FragData[0]=vec4(trans,1.0);
#else
  discard;
#endif
 }else{
  if(c.a<0.5)discard;gl_FragData[0]=vec4(0,0,0,1);
 }
}
