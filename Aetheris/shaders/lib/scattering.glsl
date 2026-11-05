#ifndef AETHERIS_SCATTERING
#define AETHERIS_SCATTERING
// Distances in kilometres: avoids subtracting ~4e13 values in GLSL float.
const float planetRadius=6360.0,atmosphereRadius=6440.0;
const vec3 betaRayleigh=vec3(0.0058,0.0135,0.0331);
const vec3 betaOzone=vec3(0.00065,0.00188,0.000085);
const float betaMie=0.0032;
float shellExit(vec3 p,vec3 d,float radius){float b=dot(p,d);return max(0.0,-b+sqrt(max(0.0,b*b-dot(p,p)+radius*radius)));}
vec3 airDensity(vec3 p){float height=max(0.0,length(p)-planetRadius);return vec3(exp(-height/8.0),exp(-height/1.2),max(0.0,1.0-abs(height-25.0)/15.0));}
vec3 opticalExtinction(vec3 depths){return betaRayleigh*depths.x+vec3(betaMie)*depths.y+betaOzone*depths.z;}
vec3 singleScattering(vec3 ray,vec3 sun){
 vec3 origin=vec3(0,planetRadius+max(cameraPosition.y,1.0)*0.001,0);
 float distanceV=shellExit(origin,ray,atmosphereRadius);
 float b=dot(origin,ray),ground=b*b-dot(origin,origin)+planetRadius*planetRadius;
 if(b<0.0&&ground>0.0)distanceV=min(distanceV,max(0.0,-b-sqrt(ground)));
 float ds=distanceV/6.0;vec3 viewDepth=vec3(0),sumR=vec3(0),sumM=vec3(0);
 for(int i=0;i<6;i++){
  vec3 p=origin+ray*(float(i)+0.5)*ds;vec3 density=airDensity(p);
  vec3 midpointDepth=viewDepth+density*ds*0.5;viewDepth+=density*ds;
  float lightB=dot(p,sun),disc=lightB*lightB-dot(p,p)+planetRadius*planetRadius;
  if(lightB<0.0&&disc>0.0)continue; // planet occludes direct sunlight
  float lightStep=shellExit(p,sun,atmosphereRadius)/4.0;vec3 lightDepth=vec3(0);
  for(int j=0;j<4;j++)lightDepth+=airDensity(p+sun*(float(j)+0.5)*lightStep)*lightStep;
  vec3 attenuation=exp(-opticalExtinction(midpointDepth+lightDepth));
  sumR+=attenuation*density.x*ds;sumM+=attenuation*density.y*ds;
 }
 float mu=clamp(dot(ray,sun),-1.0,1.0),phaseR=3.0/(16.0*PI)*(1.0+mu*mu);
 float g=0.76,phaseM=(1.0-g*g)/(4.0*PI*pow(max(0.05,1.0+g*g-2.0*g*mu),1.5));
 return (sumR*betaRayleigh*phaseR+sumM*betaMie*phaseM)*18.0;
}
// Cheap air-mass fit used for reflections and the balanced sky mode.
vec3 scatteringFit(vec3 ray,vec3 sun){
 float h=max(ray.y,0.0),airmass=1.0/(h+0.12);
 float sunAir=1.0/(max(sun.y,0.0)+0.12);
 vec3 sunlightTrans=exp(-vec3(0.07,0.15,0.32)*sunAir*0.5);
 vec3 base=vec3(0.09,0.26,0.60)*(1.0-exp(-airmass*0.16))*2.0;
 float mu=max(dot(ray,sun),0.0);
 return base*dayAmount()+sunlightTrans*pow(mu,24.0)*0.2*dayAmount();
}
#endif
