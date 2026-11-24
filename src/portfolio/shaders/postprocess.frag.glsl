// postprocess.frag.glsl — Post-processing pass (Bloom + Vignette + Chromatic Aberration)
// Usado com @react-three/postprocessing EffectComposer

uniform sampler2D tDiffuse; // Cena renderizada
uniform float uBloomThreshold; // Limiar para bloom (0.85)
uniform float uBloomIntensity; // Intensidade do bloom (0.3)
uniform float uVignetteAmount; // Quantidade de vignette (0.3)
uniform float uChromaticAberration; // Aberração cromática (0.002)
uniform vec2 uResolution; // Resolução da tela

// Função para bloom simples (threshold + blur aproximado)
vec3 bloom(vec2 uv) {
  vec3 color = texture2D(tDiffuse, uv).rgb;

  // Threshold: só pixels brilhantes contribuem
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  if (luminance < uBloomThreshold) return vec3(0.0);

  // Intensidade baseada no excesso do threshold
  float intensity = (luminance - uBloomThreshold) / (1.0 - uBloomThreshold);
  return color * intensity * uBloomIntensity;
}

// Vignette suave
float vignette(vec2 uv) {
  vec2 center = uv - 0.5;
  float dist = length(center) * 1.414; // Normalizado para canto = 1
  return 1.0 - smoothstep(0.5, 1.0, dist) * uVignetteAmount;
}

// Chromatic aberration (desvio RGB nas bordas)
vec3 chromaticAberration(vec2 uv) {
  vec2 center = uv - 0.5;
  float dist = length(center);
  float factor = dist * uChromaticAberration;

  float r = texture2D(tDiffuse, uv + center * factor).r;
  float g = texture2D(tDiffuse, uv).g;
  float b = texture2D(tDiffuse, uv - center * factor).b;

  return vec3(r, g, b);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // Cor base
  vec3 color = texture2D(tDiffuse, uv).rgb;

  // Aplica bloom (aditivo)
  color += bloom(uv);

  // Aplica chromatic aberration
  color = chromaticAberration(uv);

  // Aplica vignette
  color *= vignette(uv);

  // Gamma correction simples (sRGB)
  color = pow(color, vec3(1.0 / 2.2));

  gl_FragColor = vec4(color, 1.0);
}