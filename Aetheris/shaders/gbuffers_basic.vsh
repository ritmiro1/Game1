#version 120
varying vec4 tint;
varying float distanceV;
void main(){vec4 p=gl_ModelViewMatrix*gl_Vertex;distanceV=length(p.xyz);tint=gl_Color;gl_Position=gl_ProjectionMatrix*p;}
