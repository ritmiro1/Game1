#version 120
#include "/lib/common.glsl"
varying vec2 uv;
/* DRAWBUFFERS:0 */
void main(){
 vec3 color=texture2D(colortex0,uv).rgb;
 if(texture2D(depthtex0,uv).r>=0.99999 && isEyeInWater!=1){
  // Normalize only sky-neighbor weights: no opaque mountain/roof cloud bleeding.
  vec2 size=effectDimensions(),p=uv*size-0.5,base=floor(p),f=fract(p);
  vec4 clouds=vec4(0);float total=0.0;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){
   vec2 cell=vec2(float(x),float(y));vec2 t=(base+cell+0.5)/size;
   float w=(x==0?1.0-f.x:f.x)*(y==0?1.0-f.y:f.y);
   if(texture2D(depthtex0,safeUV(t)).r>=0.99999){clouds+=texture2D(colortex4,clamp(t,0.5/size,1.0-0.5/size))*w;total+=w;}
  }
  if(total>0.0001){clouds/=total;color=color*clouds.a+clouds.rgb;}
 }
 gl_FragData[0]=vec4(color,1);
}
