precision mediump float;

uniform float u_time;
uniform float u_spectrum[512];
uniform float u_energy;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 newPosition = position;

  // --- Frequency bands ---
  float bass = (u_spectrum[2] + u_spectrum[3] + u_spectrum[4] + u_spectrum[5]) * 0.25;
  float mid  = (u_spectrum[100] + u_spectrum[120] + u_spectrum[140]) / 3.0;
  float high = (u_spectrum[400] + u_spectrum[420] + u_spectrum[440]) / 3.0;

  // --- Bass: whole sphere breathing ---
  float bassInfluence = bass * (1.0 + 0.5 * sin(u_time * 4.0));

  // --- Mids: rings around the equator (use latitude vUv.y) ---
  float midInfluence = mid * 0.8 * sin(vUv.y * 40.0 + u_time * 3.0);

  // --- Highs: sparkly longitudes (use longitude vUv.x) ---
  float highInfluence = high * 0.4 * sin(vUv.x * 80.0 + u_time * 15.0);

  // --- Combine ---
  float displacement = bassInfluence + midInfluence + highInfluence;

  // Push outward along the sphere normal
  newPosition.xyz += normalize(newPosition) * displacement;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
