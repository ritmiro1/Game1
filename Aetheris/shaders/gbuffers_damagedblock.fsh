#version 120
uniform sampler2D texture;
varying vec2 uv;varying vec4 tint;
/* DRAWBUFFERS:0 */
void main(){vec4 c=texture2D(texture,uv)*tint;if(c.a<0.01)discard;gl_FragData[0]=vec4(mix(vec3(1.0),pow(c.rgb,vec3(1.2)),c.a),1.0);}
