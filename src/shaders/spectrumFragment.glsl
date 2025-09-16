precision mediump float;

uniform float u_time;
varying vec2 vUv;

// quick HSV → RGB conversion
vec3 hsv2rgb(vec3 c) {
  vec3 rgb = clamp( abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0),
                             6.0) - 3.0) - 1.0,
                    0.0,
                    1.0 );
  return c.z * mix(vec3(1.0), rgb, c.y);
}

void main() {
  // hue cycles over time
  float hue = mod(u_time * 0.1, 1.0);

  // full saturation, full brightness
  vec3 color = hsv2rgb(vec3(hue, 1.0, 1.0));

  gl_FragColor = vec4(color, 1.0);
}
