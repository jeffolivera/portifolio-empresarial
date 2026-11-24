// particle.vert.glsl — Vertex Shader para renderização das partículas
// Recebe posições do compute shader via texture (ping-pong)

attribute vec2 uv; // Coordenadas UV da instância (index no texture)
attribute float index; // Índice da partícula (0 a count-1)

uniform sampler2D positionTexture; // Texture com posições atuais (RGBA = xyz + life)
uniform float uPointSize; // Tamanho base em pixels
uniform float uPixelRatio; // devicePixelRatio
uniform float uSizeAttenuation; // Se tamanho diminui com distância

varying float vLife; // Life para fragment shader (fade out)
varying vec3 vPosition; // Posição world para efeitos

void main() {
  // Lê posição e life da texture (index mapeia para UV)
  vec4 posLife = texture2D(positionTexture, uv);
  vec3 position = posLife.xyz;
  float life = posLife.w;

  vLife = life;
  vPosition = position;

  // Model view projection
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Tamanho do ponto com atenuação de perspectiva
  float size = uPointSize * uPixelRatio;
  if (uSizeAttenuation > 0.0) {
    size /= -mvPosition.z; // Perspectiva: mais longe = menor
  }
  gl_PointSize = max(size, 1.0); // Mínimo 1px
}