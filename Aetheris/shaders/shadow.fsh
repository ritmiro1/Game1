#version 120
uniform sampler2D texture;varying vec2 uv;varying vec4 tint;
/* DRAWBUFFERS:0 */
void main(){vec4 c=texture2D(texture,uv)*tint;if(c.a<0.5)discard;gl_FragData[0]=c;}
