// particle-compute.frag.glsl — Compute Shader (Fragment Shader usado como compute via ping-pong)
// Simula física das partículas na GPU: atração, ruído, damping, respawn
// Executa em render-to-texture (FBO) — cada fragment = uma partícula

// Texturas de entrada (estado anterior)
uniform sampler2D positionTexture; // RGBA: xyz + life
uniform sampler2D velocityTexture; // RGB: velocity xyz
uniform sampler2D lifeTexture;     // R: life (redundante, mas útil)

// Parâmetros de simulação
uniform float uTime;           // Tempo global (segundos)
uniform float uDeltaTime;      // Delta time do frame
uniform vec2 uResolution;      // Resolução da texture (count x 1)
uniform vec3 uMouse;           // Posição do mouse em world space
uniform float uMouseStrength;  // Força de atração do mouse
uniform vec3 uAttractors[4];   // Pontos de atração fixos (cílios, lábios, etc.)
uniform float uAttractorStrength; // Força dos attractors fixos
uniform float uNoiseScale;     // Escala do ruído curl
uniform float uNoiseStrength;  // Intensidade do ruído
uniform float uDamping;        // Amortecimento da velocidade (0.98)
uniform float uLifeDecay;      // Taxa de decaimento da life por segundo
uniform float uSpawnRadius;    // Raio de spawn (esfera)
uniform float uAttractorRadius; // Raio de influência dos attractors

// Ruído simples 3D (hash-based)
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= p + 17.0;
  p = fract(p * 0.3183099 + 0.1);
  return fract(p.x * p.y * p.z * 91.0);
}

// Ruído de valor 3D
float noise3d(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f); // Smoothstep

  float n = mix(
    mix(
      mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
      mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x),
      f.y
    ),
    mix(
      mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
      mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x),
      f.y
    ),
    f.z
  );
  return n * 2.0 - 1.0; // -1 a 1
}

// FBM (Fractional Brownian Motion) para ruído mais orgânico
float fbm(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 6; i++) { // max 6 octaves
    if (i >= octaves) break;
    value += amplitude * noise3d(p * frequency);
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return value;
}

// Curl Noise para movimento fluido/organico (derivada do ruído)
vec3 curlNoise(vec3 p) {
  const float eps = 0.01;
  vec3 n = vec3(
    fbm(p + vec3(eps, 0, 0), 4) - fbm(p - vec3(eps, 0, 0), 4),
    fbm(p + vec3(0, eps, 0), 4) - fbm(p - vec3(0, eps, 0), 4),
    fbm(p + vec3(0, 0, eps), 4) - fbm(p - vec3(0, 0, eps), 4)
  );
  return normalize(n) * 0.5 + 0.5; // Normalizado aprox
}

// Ponto aleatório na esfera (para respawn)
vec3 randomSpherePoint(float radius, vec2 seed) {
  float u = hash(vec3(seed.x, seed.y, 0.0));
  float v = hash(vec3(seed.x, seed.y, 1.0));
  float theta = 2.0 * 3.14159 * u;
  float phi = acos(2.0 * v - 1.0);
  float r = radius * pow(hash(vec3(seed.x, seed.y, 2.0)), 1.0/3.0); // Distribuição uniforme no volume
  return vec3(
    r * sin(phi) * cos(theta),
    r * sin(phi) * sin(theta),
    r * cos(phi)
  );
}

void main() {
  // UV da partícula (cada pixel = uma partícula)
  vec2 uv = gl_FragCoord.xy / uResolution;

  // Lê estado anterior
  vec4 posLife = texture2D(positionTexture, uv);
  vec3 pos = posLife.xyz;
  float life = posLife.w;

  vec3 vel = texture2D(velocityTexture, uv).rgb;

  // ========== FORÇAS ==========

  // 1. Atração pelo mouse (attractor[0] = mouse)
  if (uMouseStrength > 0.0) {
    vec3 toMouse = uMouse - pos;
    float dist = length(toMouse);
    if (dist < uAttractorRadius && dist > 0.01) {
      float force = uMouseStrength / (dist * dist + 0.1);
      vel += normalize(toMouse) * force * uDeltaTime;
    }
  }

  // 2. Atração por attractors fixos (1-3)
  for (int i = 1; i < 4; i++) {
    vec3 attr = uAttractors[i];
    if (attr != vec3(0.0)) { // Attractor ativo
      vec3 toAttr = attr - pos;
      float dist = length(toAttr);
      if (dist < uAttractorRadius && dist > 0.01) {
        float force = uAttractorStrength / (dist * dist + 0.1);
        vel += normalize(toAttr) * force * uDeltaTime;
      }
    }
  }

  // 3. Ruído curl para organicidade
  vec3 noise = curlNoise(pos * uNoiseScale + uTime * 0.1);
  vel += (noise - 0.5) * 2.0 * uNoiseStrength * uDeltaTime;

  // ========== INTEGRAÇÃO ==========

  // Damping (amortecimento)
  vel *= pow(uDamping, uDeltaTime * 60.0); // Normalizado para 60fps

  // Atualiza posição
  pos += vel * uDeltaTime;

  // Decaimento da vida
  life -= uLifeDecay * uDeltaTime;

  // ========== RESPAWN ==========

  if (life <= 0.0) {
    // Novo spawn na esfera
    vec2 seed = uv * 1000.0 + vec2(uTime * 100.0, 0.0);
    pos = randomSpherePoint(uSpawnRadius, seed);
    life = 1.0;
    vel = vec3(0.0); // Velocidade zero no nascimento
  }

  // ========== OUTPUT ==========

  // Escreve na texture de posição (RGBA = xyz + life)
  gl_FragColor = vec4(pos, life);
}