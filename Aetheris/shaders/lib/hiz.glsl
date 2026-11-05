#ifndef AETHERIS_HIZ
#define AETHERIS_HIZ
vec2 hierarchySize(int level){float factor=level==0?0.5:(level==1?0.25:(level==2?0.125:0.0625));return max(floor(vec2(viewWidth,viewHeight)*factor),vec2(1.0));}
float minimumDepth(vec2 uv,int level){
 vec2 size=hierarchySize(level);uv=(clamp(floor(uv*size),vec2(0),size-1.0)+0.5)/size;
 if(level==0)return texture2D(colortex9,uv).r;
 if(level==1)return texture2D(colortex10,uv).r;
 if(level==2)return texture2D(colortex11,uv).r;
 return texture2D(colortex12,uv).r;
}
// Exact projective ray/cell-boundary intersection, not a constant UV-step guess.
float rayCellExit(vec3 q,vec3 ray,vec2 uv,int level){
 vec4 c=gbufferProjection*vec4(q,1),d=gbufferProjection*vec4(ray,0);
 vec2 size=hierarchySize(level),cell=floor(uv*size);
 vec2 derivative=(d.xy*c.w-c.xy*d.w);
 vec2 boundary=(cell+step(vec2(0),derivative))/size;
 vec2 ndc=(boundary-temporalJitter(frameCounter))*2.0-1.0;
 vec2 denominator=d.xy-ndc*d.w;
 vec2 numerator=ndc*c.w-c.xy;
 float tx=abs(denominator.x)>1e-7?numerator.x/denominator.x:1e6;
 float ty=abs(denominator.y)>1e-7?numerator.y/denominator.y:1e6;
 if(tx<=0.0001)tx=1e6;if(ty<=0.0001)ty=1e6;
 return min(tx,ty);
}
#endif
