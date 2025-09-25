precision mediump float;

uniform float u_time;
uniform float u_spectrum[32];
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 newPosition = position;

  float accum = 0.0;
  for(int i = 0; i < u_spectrum.length();i++)
  {
    accum += u_spectrum[i];
  }

  accum = accum / 32.0;

  float displacement = accum * (1.0 + 0.5 * sin(u_time * 4.0));

  // Push outward along the sphere normal
  newPosition.xyz += normalize(newPosition) * displacement * 0.5;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
