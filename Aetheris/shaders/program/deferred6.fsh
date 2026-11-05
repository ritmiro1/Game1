#include "/lib/common.glsl"
varying vec2 uv;
const bool colortex13Clear=false;
/* RENDERTARGETS:13 */
void main(){
 vec4 current=texture2D(colortex14,uv);vec4 result=current;
 float d=texture2D(depthtex0,uv).r;
 vec3 p=viewPosition(uv,d),worldP=worldRelative(p)+cameraPosition-previousCameraPosition;
 vec4 clip=gbufferPreviousProjection*gbufferPreviousModelView*vec4(worldP,1);
 vec2 oldUV=clip.xy/max(clip.w,0.001)*0.5+0.5+temporalJitter(frameCounter-1);
 float expected=max(clip.w,0.0);bool valid=clip.w>0.0;
#ifdef AETHER_VELOCITY_ACTIVE
 vec4 velocity=texture2D(colortex8,uv);valid=velocity.w>0.99;oldUV=uv+velocity.xy;expected=velocity.z;
#endif
 if(!valid)result.a=-abs(current.a); // visible now, never reused as stale moving-object history
 vec2 size=max(floor(vec2(viewWidth,viewHeight)*0.5),vec2(1.0));
 vec4 meta=texture2D(colortex13,0.5/size);
 vec4 extra=texture2D(colortex13,vec2(1.5,0.5)/size);
 bool fresh=meta.a== -dimensionTag() && extra.a== -dimensionTag() && abs(extra.x-floor(float(frameCounter-1)/1024.0))<0.25 && abs(meta.x*16.0+extra.y-viewWidth)<0.6 && abs(meta.y*16.0+extra.z-viewHeight)<0.6 && abs(meta.z-mod(float(frameCounter-1),1024.0))<0.25;
 if(valid && fresh && frameCounter>2 && length(cameraPosition-previousCameraPosition)<2.0 && current.a>0.0 && all(greaterThan(oldUV,1.5/size))&&all(lessThan(oldUV,1.0-1.5/size))){
  vec4 history=texture2D(colortex13,oldUV);
  if(history.a>0.0 && abs(history.a-expected)<max(0.08,expected*0.02)){
   vec3 lo=current.rgb,hi=lo;
   for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec3 value=texture2D(colortex14,clamp(uv+vec2(float(x),float(y))/size,0.5/size,1.0-0.5/size)).rgb;
    lo=min(lo,value);hi=max(hi,value);
   }
   result.rgb=mix(current.rgb,clamp(history.rgb,lo,hi),0.80*exp(-length((oldUV-uv)*vec2(viewWidth,viewHeight))*0.04));
  }
 }
 if(gl_FragCoord.x<1.0&&gl_FragCoord.y<1.0)result=vec4(floor(viewWidth/16.0),floor(viewHeight/16.0),mod(float(frameCounter),1024.0),-dimensionTag());
 if(gl_FragCoord.x>=1.0&&gl_FragCoord.x<2.0&&gl_FragCoord.y<1.0)result=vec4(floor(float(frameCounter)/1024.0),mod(viewWidth,16.0),mod(viewHeight,16.0),-dimensionTag());
 gl_FragData[0]=result;
}
