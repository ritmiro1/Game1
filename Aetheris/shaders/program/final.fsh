#include "/lib/common.glsl"
#include "/lib/noise.glsl"
#include "/lib/post.glsl"
varying vec2 uv;
void main(){vec3 c=fxaaColor(uv);float d=texture2D(depthtex0,uv).r;
#if DOF == 1
 float focus=-viewPosition(vec2(0.5),texture2D(depthtex0,vec2(0.5)).r).z;
 float z=-viewPosition(uv,d).z;float blur=clamp(abs(z-focus)/max(z,0.1),0.0,1.0)*DOF_STRENGTH*5.0;
 vec3 b=vec3(0);for(int i=0;i<8;i++){float a=float(i)*2.399963;vec2 off=vec2(cos(a),sin(a))*blur/vec2(viewWidth,viewHeight);b+=texture2D(colortex0,clamp(uv+off,vec2(0.001),vec2(0.999))).rgb;}c=mix(c,b/8.0,saturate(blur));
#endif
#if MOTION_BLUR == 1
 if(d<0.99999 && texture2D(colortex2,uv).a>=0.0){
  vec3 w=worldRelative(viewPosition(uv,d))+cameraPosition-previousCameraPosition;
  vec4 prev=gbufferPreviousProjection*gbufferPreviousModelView*vec4(w,1);
  if(prev.w>0.0){
   vec2 oldUV=prev.xy/prev.w*0.5+0.5+temporalJitter(frameCounter-1);
   // Remove sampling jitter from camera velocity: it is not physical motion.
   vec2 velocity=(uv-temporalJitter(frameCounter))-(oldUV-temporalJitter(frameCounter-1));
#ifdef AETHER_VELOCITY_ACTIVE
   vec4 data=texture2D(colortex8,uv);
   velocity=data.w>0.99?-data.xy+temporalJitter(frameCounter-1)-temporalJitter(frameCounter):vec2(0.0);
#endif
   velocity=clamp(velocity,vec2(-0.05),vec2(0.05))*MOTION_BLUR_STRENGTH;
   vec3 b=c;for(int i=1;i<5;i++)b+=texture2D(colortex0,safeUV(uv-velocity*float(i)/4.0)).rgb;c=b/5.0;
  }
 }
#endif
 #if BLOOM_ENABLED == 1
 c+=texture2D(colortex5,uv).rgb*BLOOM_STRENGTH;
#endif
 c=aces(c*adaptedExposure());
#if COLOR_GRADE == 1
 c*=mix(vec3(0.96,0.99,1.04),vec3(1.035,1.01,0.975),c);
#elif COLOR_GRADE == 2
 c=pow(c,vec3(1.06,1.02,0.98));
#endif
 float l=dot(c,vec3(0.2126,0.7152,0.0722));c=mix(vec3(l),c,SATURATION);
#if VIGNETTE == 1
 vec2 v=uv*(1.0-uv);c*=0.8+0.2*pow(16.0*v.x*v.y,0.2);
#endif
 c=pow(max(c,vec3(0)),vec3(1.0/2.2));c+=(hash12(gl_FragCoord.xy+frameTimeCounter)-0.5)/255.0;
 gl_FragColor=vec4(clamp(c,0.0,1.0),1);
}
