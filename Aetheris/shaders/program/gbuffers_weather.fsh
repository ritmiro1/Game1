#include "/lib/common.glsl"
varying vec2 uv,lm;
varying vec4 tint;
varying vec3 positionV;
/* DRAWBUFFERS:0 */
// Weather is an alpha-blended color layer, never an opaque material/velocity writer.
void main(){
 vec4 tex=texture2D(texture,uv);
 float alpha=tex.a*tint.a*RAIN_OPACITY;
 alpha*=smoothstep(0.3,1.5,length(positionV));
 if(alpha<0.003)discard;
 float luminance=dot(tex.rgb,vec3(0.2126,0.7152,0.0722));
 vec3 ambient=mix(vec3(0.018,0.024,0.032)*NIGHT_BRIGHTNESS,vec3(0.20,0.23,0.26),dayAmount());
 ambient*=mix(0.35,1.0,outdoorAccess(lm.y));
 float block=pow(saturate((lm.x-0.03125)/0.9375),1.65);
 vec3 color=ambient+vec3(0.35,0.24,0.12)*block*BLOCK_LIGHT_STRENGTH;
 gl_FragData[0]=vec4(color*mix(0.65,1.0,luminance),alpha);
}
