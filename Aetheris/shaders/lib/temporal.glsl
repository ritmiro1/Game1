#ifndef AETHERIS_TEMPORAL
#define AETHERIS_TEMPORAL
// YCoCg neighborhood clipping limits stale highlights and disocclusion trails.
vec3 toYCoCg(vec3 c){return vec3(dot(c,vec3(0.25,0.5,0.25)),(c.r-c.b)*0.5,(-c.r+2.0*c.g-c.b)*0.25);}
vec3 fromYCoCg(vec3 c){return vec3(c.x+c.y-c.z,c.x+c.z,c.x-c.y-c.z);}
vec3 resolveTemporal(vec2 uv,vec3 current,float depth,out float historyDepth){
 bool sky=depth>=0.99999;
 vec3 p=viewPosition(uv,depth);
 historyDepth=sky?min(far,32000.0):clamp(-p.z,0.001,32000.0);
 vec4 material=texture2D(colortex2,uv);
 // No motion vectors for hands, waves or translucent interfaces: don't accumulate them.
 bool unstable=material.a< -0.5 || material.g>0.5;
 if(unstable)historyDepth=0.0;
#if TAA == 1
 if(unstable || frameCounter<2 || length(cameraPosition-previousCameraPosition)>2.0)return current;
 // Reserved history texel: reject resize, stale frames, AA toggles and fresh buffers.
 vec4 meta=texture2D(colortex6,0.5/vec2(viewWidth,viewHeight));
 if(!(meta.a== -1.0 && abs(meta.x-viewWidth)<0.6 && abs(meta.y-viewHeight)<0.6 && abs(meta.z-mod(float(frameCounter-1),1024.0))<0.25))return current;
 vec3 previousP;
 if(sky){vec3 direction=mat3(gbufferModelViewInverse)*safeNormalize(p);previousP=mat3(gbufferPreviousModelView)*direction;}
 else{vec3 worldP=worldRelative(p)+cameraPosition-previousCameraPosition;previousP=(gbufferPreviousModelView*vec4(worldP,1.0)).xyz;}
 vec4 clip=gbufferPreviousProjection*vec4(previousP,sky?0.0:1.0);
 if(clip.w<=0.0)return current;
 vec2 previousUV=clip.xy/clip.w*0.5+0.5+temporalJitter(frameCounter-1);
 vec2 edge=1.5/vec2(viewWidth,viewHeight);
 if(any(lessThan(previousUV,edge))||any(greaterThan(previousUV,1.0-edge)))return current;
 vec4 history=texture2D(colortex6,previousUV);
 float expected=sky?min(far,32000.0):max(-previousP.z,0.0);
 // This also rejects invalid/uninitialized depth and NaN alpha on a fresh buffer.
 if(!(history.a>0.0 && abs(history.a-expected)<max(0.06,expected*0.015)))return current;
 vec3 lo=toYCoCg(current),hi=lo;
 vec2 px=1.0/vec2(viewWidth,viewHeight);
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec3 sampleC=toYCoCg(texture2D(colortex0,safeUV(uv+vec2(float(x),float(y))*px)).rgb);
  lo=min(lo,sampleC);hi=max(hi,sampleC);
 }
 vec3 bounded=clamp(toYCoCg(history.rgb),lo,hi);
 float motion=length((previousUV-uv)*vec2(viewWidth,viewHeight));
 float weight=TAA_HISTORY*exp(-motion*0.04);
 vec3 result=mix(current,max(fromYCoCg(bounded),vec3(0.0)),weight);
 return result;
#else
 return current;
#endif
}
#endif
