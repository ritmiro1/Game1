#include "/lib/common.glsl"
varying vec2 uv;
/* DRAWBUFFERS:03 */
void main(){
 vec3 color=texture2D(colortex0,uv).rgb;float depth=texture2D(depthtex0,uv).r;
 if(depth<0.99999){
  float z=-viewPosition(uv,depth).z;vec2 size=max(floor(vec2(viewWidth,viewHeight)*0.5),vec2(1));
  vec2 p=uv*size-0.5,cell=floor(p),f=fract(p);vec3 sum=vec3(0);float weight=0.0;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){
   vec2 t=clamp((cell+vec2(float(x),float(y))+0.5)/size,0.5/size,1.0-0.5/size);
#if GI_TEMPORAL == 1
   if(t.y<1.0/size.y&&t.x<2.0/size.x)continue; // reserved history metadata texel
   vec4 value=texture2D(colortex13,t);
#else
   vec4 value=texture2D(colortex14,t);
#endif
   float w=(x==0?1.0-f.x:f.x)*(y==0?1.0-f.y:f.y);
   w*=exp(-abs(abs(value.a)-z)/max(0.1,z*0.015));
   if(abs(value.a)>0.0){sum+=value.rgb*w;weight+=w;}
  }
  if(weight>0.0001)color+=sum/weight;
 }
 // GI updates opaque surfaces, but must not copy the visible star field back
 // into background texels of the deliberately star-free reflection source.
 vec4 savedSource=texture2D(colortex3,uv);
 vec3 reflectionSource=color;
 if(depth>=0.99999 || savedSource.a<=0.0)reflectionSource=savedSource.rgb;
 gl_FragData[0]=vec4(color,1);gl_FragData[1]=vec4(reflectionSource,savedSource.a);
}
