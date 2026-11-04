#version 120
// OpenGL GL_RGBA16F: GLSL 1.20 does not define texture-format enum names.
// Keep the symbolic const declarations below for Iris/OptiFine format scanning.
#ifndef RGBA16F
#define RGBA16F 0x881A
#endif
#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/post.glsl"
varying vec2 uv;
const int colortex0Format = RGBA16F;
const int colortex1Format = RGBA16F;
const int colortex2Format = RGBA16F;
const int colortex3Format = RGBA16F;
const int colortex4Format = RGBA16F;
const int colortex5Format = RGBA16F;
const bool colortex0Clear = true;
const bool colortex1Clear = true;
const bool colortex2Clear = true;
/* DRAWBUFFERS:03 */
void main(){float d=texture2D(depthtex0,uv).r;vec3 c=texture2D(colortex0,uv).rgb;
 if(d<0.99999){vec3 p=viewPosition(uv,d),n=normalize(texture2D(colortex1,uv).xyz*2.0-1.0);c*=aoAt(uv,p,n);}
 gl_FragData[0]=vec4(c,1);gl_FragData[1]=vec4(c,1);
}
