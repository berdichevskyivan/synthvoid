precision mediump float;

uniform float u_time;
uniform float u_audio;
varying vec2 vUv;

void main() {
  vUv = uv;

  vec3 newPosition = position;

  // radial distance from center
  float dist = distance(newPosition.xy, vec2(0.0, 0.0));

  // ripple = sine wave based on distance - time
  float ripple = sin(dist * 10.0 - u_time * 5.0);

  // make ripples fade as they move out
  float falloff = exp(-dist * 0.5);

  // final displacement
  newPosition.z += ripple * falloff * u_audio * 3.0;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}