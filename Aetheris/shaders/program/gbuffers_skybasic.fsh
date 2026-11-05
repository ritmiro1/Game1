#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/sky.glsl"
/* DRAWBUFFERS:012 */
void main(){vec2 uv=gl_FragCoord.xy/vec2(viewWidth,viewHeight);vec3 ray=normalize(mat3(gbufferModelViewInverse)*viewPosition(uv,1.0));gl_FragData[0]=vec4(renderSky(ray),1);gl_FragData[1]=vec4(0.5,1,0.5,1);gl_FragData[2]=vec4(0);}
