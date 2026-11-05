#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/indirect.glsl"
varying vec2 uv;
/* RENDERTARGETS:14 */
void main(){
 float d=texture2D(depthtex0,uv).r;vec4 m=texture2D(colortex2,uv);
 if(d>=0.99999||m.a== -1.0||m.a>0.99){gl_FragData[0]=vec4(0);return;}
 vec3 p=viewPosition(uv,d),n=safeNormalize(texture2D(colortex1,uv).xyz*2.0-1.0);
 vec3 indirect=screenIndirect(uv,p,n,texture2D(colortex15,uv).rgb);
 gl_FragData[0]=vec4(indirect,min(-p.z,32000.0));
}
