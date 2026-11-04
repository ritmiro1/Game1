#ifndef AETHERIS_POST
#define AETHERIS_POST
vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}
vec3 bright(vec3 c){float l=max(c.r,max(c.g,c.b));return c*max(l-BLOOM_THRESHOLD,0.0)/max(l,0.0001);}
float aoAt(vec2 uv,vec3 p,vec3 n){
 if(AO_STRENGTH<=0.0 || -p.z>=AO_DISTANCE)return 1.0;
 float occ=0.0;
 for(int i=0;i<AO_SAMPLES;i++){
 float a=float(i)*2.399963+hash12(floor(uv*vec2(viewWidth,viewHeight)))*6.28;
 float r=sqrt((float(i)+0.5)/float(AO_SAMPLES))*AO_RADIUS;
 vec2 offset=vec2(cos(a),sin(a))*r*vec2(gbufferProjection[0][0],gbufferProjection[1][1])/max(-p.z,0.5)*0.5;
 vec2 t=clamp(uv+offset,vec2(0.001),vec2(0.999));float d=texture2D(depthtex0,t).r;
 vec3 delta=viewPosition(t,d)-p;float len=length(delta);
 occ+=max(dot(n,delta/max(len,0.0001))-0.12,0.0)*(1.0-smoothstep(AO_RADIUS,AO_RADIUS*2.0,len))*step(d,0.99999);
 }return 1.0-occ/float(AO_SAMPLES)*AO_STRENGTH*(1.0-smoothstep(AO_DISTANCE*0.75,AO_DISTANCE,-p.z));
}
// Pair adjacent Gaussian taps using hardware linear filtering: 5 reads instead of 9.
vec3 bloomBlur(sampler2D tex,vec2 uv,vec2 direction){
 vec2 edge=0.5/effectDimensions();
 vec3 c=texture2D(tex,clamp(uv,edge,1.0-edge)).rgb*0.2041637;
 c+=(texture2D(tex,clamp(uv+direction*1.40733,edge,1.0-edge)).rgb+texture2D(tex,clamp(uv-direction*1.40733,edge,1.0-edge)).rgb)*0.3040054;
 c+=(texture2D(tex,clamp(uv+direction*3.29421,edge,1.0-edge)).rgb+texture2D(tex,clamp(uv-direction*3.29421,edge,1.0-edge)).rgb)*0.0939128;
 return c;
}
// Spatial fallback when temporal AA is disabled. Compare bounded luminance so
// a single HDR emissive doesn't force excessive blur over neighboring pixels.
float aaLuma(vec3 c){float l=dot(max(c,vec3(0.0)),vec3(0.299,0.587,0.114));return l/(1.0+l);}
vec3 fxaaColor(vec2 uv){
 vec2 px=1.0/vec2(viewWidth,viewHeight);vec3 c=texture2D(colortex0,safeUV(uv)).rgb;
#if FXAA == 1 && TAA == 0
 vec3 n=texture2D(colortex0,safeUV(uv+vec2(0,px.y))).rgb,s=texture2D(colortex0,safeUV(uv-vec2(0,px.y))).rgb;
 vec3 e=texture2D(colortex0,safeUV(uv+vec2(px.x,0))).rgb,w=texture2D(colortex0,safeUV(uv-vec2(px.x,0))).rgb;
 float lc=aaLuma(c),ln=aaLuma(n),ls=aaLuma(s),le=aaLuma(e),lw=aaLuma(w);
 float low=min(lc,min(min(ln,ls),min(le,lw))),high=max(lc,max(max(ln,ls),max(le,lw)));
 float range=high-low;
 if(range<max(0.025,high*0.125))return c;
 vec2 dir=vec2(-(ln-ls),le-lw);
 dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+max((ln+ls+le+lw)*0.03125,0.0078125)),vec2(-6),vec2(6))*px;
 vec3 a=0.5*(texture2D(colortex0,safeUV(uv+dir/6.0)).rgb+texture2D(colortex0,safeUV(uv-dir/6.0)).rgb);
 vec3 b=a*0.5+0.25*(texture2D(colortex0,safeUV(uv+dir*0.5)).rgb+texture2D(colortex0,safeUV(uv-dir*0.5)).rgb);
 float lb=aaLuma(b);c=(lb<low||lb>high)?a:b;
#endif
 return c;
}
#endif
