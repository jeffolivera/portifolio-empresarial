// particle.frag.glsl — Fragment Shader para renderização das partículas
// Gradiente de cor baseado em life + brilho suave (additive blending)

varying float vLife;
varying vec3 vPosition;

uniform vec3 uColorStart; // Cor no início da vida (ex: dourado)
uniform vec3 uColorEnd;   // Cor no fim da vida (ex: vinho)
uniform float uOpacity;   // Opacidade base
uniform sampler2D uGradientTexture; // Opcional: texture 16x1 para gradiente complexo

void main() {
  // Forma circular suave (alpha radial)
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);
  float alpha = smoothstep(0.5, 0.0, dist); // 1 no centro, 0 na borda

  // Falloff mais suave para "brilho"
  alpha = pow(alpha, 0.7);

  // Interpola cor baseada no life (1.0 = nasceu, 0.0 = morre)
  vec3 color = mix(uColorEnd, uColorStart, vLife);

  // Se tem gradient texture, usa ela
  // vec3 color = texture2D(uGradientTexture, vec2(vLife, 0.5)).rgb;

  // Additive blending para efeito "glow"
  gl_FragColor = vec4(color, alpha * uOpacity * vLife);
}