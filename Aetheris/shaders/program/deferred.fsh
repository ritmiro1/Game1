// OpenGL GL_RGBA16F: GLSL 1.20 does not define texture-format enum names.
// Use GLSL constants, NOT macros: Iris scans format names AFTER preprocessing.
#ifndef RGBA16F
const int RGBA16F = 0x881A;
#endif
#ifndef RGBA8
const int RGBA8 = 0x8058;
#endif
#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/post.glsl"
varying vec2 uv;
#ifndef R32F
const int R32F = 0x822E;
#endif
#ifdef AETHER_VELOCITY_ACTIVE
const int colortex8Format = RGBA16F;
#endif
#if HIZ_SSR == 1
const int colortex9Format = R32F;
const int colortex10Format = R32F;
const int colortex11Format = R32F;
const int colortex12Format = R32F;
#endif
#ifdef AETHER_GI_ACTIVE
const int colortex13Format = RGBA16F;
const int colortex14Format = RGBA16F;
const int colortex15Format = RGBA8;
#endif
const int colortex0Format = RGBA16F;
const int colortex1Format = RGBA16F;
const int colortex2Format = RGBA16F;
const int colortex3Format = RGBA16F;
const int colortex4Format = RGBA16F;
const int colortex5Format = RGBA16F;
const int colortex6Format = RGBA16F;
#if LAB_PBR == 1
// Linear RGB F0 plus material AO: 4 bytes/texel instead of another HDR attachment.
const int colortex7Format = RGBA8;
#endif
// Ping-pong history: RGB is scene-linear HDR, alpha is positive view depth.
const bool colortex6Clear = false;
const bool colortex0Clear = true;
const bool colortex1Clear = true;
const bool colortex2Clear = true;
/* DRAWBUFFERS:03 */
void main(){float d=texture2D(depthtex0,uv).r;vec3 c=texture2D(colortex0,uv).rgb;
 if(d<0.99999){vec3 p=viewPosition(uv,d),n=normalize(texture2D(colortex1,uv).xyz*2.0-1.0);vec4 m=texture2D(colortex2,uv);if(m.a>=0.0)c*=mix(aoAt(uv,p,n),1.0,saturate(m.a));}
 gl_FragData[0]=vec4(c,1);gl_FragData[1]=vec4(c,1);
}
