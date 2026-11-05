#include "/lib/common.glsl"
varying vec2 uv;
varying vec4 tint;
/* DRAWBUFFERS:0 */
// Celestial texture fallback; defaults disable vanilla discs in favor of the atmosphere.
void main(){vec4 c=texture2D(texture,uv)*tint;if(c.a<0.01)discard;gl_FragData[0]=vec4(linearColor(c.rgb)*3.0,c.a);}
