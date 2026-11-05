#ifndef AETHERIS_MOTION
#define AETHERIS_MOTION
float foliageWind(vec3 worldP,float time){return sin(worldP.x*0.6+time*1.8)*0.025;}
// No previous entity/bone matrices are exposed by the common 1.21.4 loader contract.
// Analytic deformation velocity is valid for this pack's own foliage, NOT mob animation.
vec4 previousSurfaceClip(vec3 baseRelative,float materialId){
 vec3 worldP=baseRelative+cameraPosition;
 vec3 previousRelative=baseRelative+cameraPosition-previousCameraPosition;
 if(materialId==10003.0)previousRelative.x+=foliageWind(worldP,max(0.0,frameTimeCounter-frameTime));
 return gbufferPreviousProjection*gbufferPreviousModelView*vec4(previousRelative,1.0);
}
#endif
