#ifndef AETHERIS_POST
#define AETHERIS_POST
vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}
vec3 bright(vec3 c){float l=max(c.r,max(c.g,c.b));return c*max(l-BLOOM_THRESHOLD,0.0)/max(l,0.0001);}
float aoAt(vec2 uv,vec3 p,vec3 n){float occ=0.0;
 for(int i=0;i<AO_SAMPLES;i++){
 float a=float(i)*2.399963+hash12(floor(uv*vec2(viewWidth,viewHeight)))*6.28;
 float r=sqrt((float(i)+0.5)/float(AO_SAMPLES))*AO_RADIUS;
 vec2 offset=vec2(cos(a),sin(a))*r*vec2(gbufferProjection[0][0],gbufferProjection[1][1])/max(-p.z,0.5)*0.5;
 vec2 t=clamp(uv+offset,vec2(0.001),vec2(0.999));float d=texture2D(depthtex0,t).r;
 vec3 delta=viewPosition(t,d)-p;float len=length(delta);
 occ+=max(dot(n,delta/max(len,0.0001))-0.12,0.0)*(1.0-smoothstep(AO_RADIUS,AO_RADIUS*2.0,len))*step(d,0.99999);
 }return 1.0-occ/float(AO_SAMPLES)*AO_STRENGTH;
}
vec3 bloomBlur(sampler2D tex,vec2 uv,vec2 direction){vec3 c=vec3(0);float w=0.0;for(int i=-4;i<=4;i++){float k=exp(-float(i*i)/8.0);c+=texture2D(tex,clamp(uv+direction*float(i),vec2(0.001),vec2(0.999))).rgb*k;w+=k;}return c/w;}
vec3 fxaaColor(vec2 uv){vec2 px=1.0/vec2(viewWidth,viewHeight);vec3 c=texture2D(colortex0,uv).rgb;
#if FXAA == 1
 vec3 n=texture2D(colortex0,uv+vec2(0,px.y)).rgb,s=texture2D(colortex0,uv-vec2(0,px.y)).rgb,e=texture2D(colortex0,uv+vec2(px.x,0)).rgb,w=texture2D(colortex0,uv-vec2(px.x,0)).rgb;
 vec3 l=vec3(0.299,0.587,0.114);float lc=dot(c,l),ln=dot(n,l),ls=dot(s,l),le=dot(e,l),lw=dot(w,l);
 float range=max(max(max(ln,ls),max(le,lw)),lc)-min(min(min(ln,ls),min(le,lw)),lc);
 vec2 dir=vec2(-(ln-ls),le-lw);dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+0.0312),vec2(-4),vec2(4))*px;
 vec3 a=(texture2D(colortex0,uv+dir/6.0).rgb+texture2D(colortex0,uv-dir/6.0).rgb)*0.5;
 c=mix(c,a,smoothstep(0.05,0.25,range/max(lc,0.1)));
#endif
 return c;}
#endif
