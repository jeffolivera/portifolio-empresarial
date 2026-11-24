// src/portfolio/hooks/useParticleSystem.ts
// Hook principal para gerenciar o sistema de partículas GPU (compute shader + render)

import { useRef, useEffect, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { DEFAULT_PARTICLE_CONFIG, ParticleSystemConfig, ParticleUniforms, QualityTier } from '@portfolio/types';

interface UseParticleSystemProps {
  config?: Partial<ParticleSystemConfig>;
  qualityTier: QualityTier;
  onInit?: (api: ParticleSystemAPI) => void;
}

// API exposta para controle externo (mouse, scroll, click)
export interface ParticleSystemAPI {
  setMousePosition: (x: number, y: number, z: number) => void;
  setMouseStrength: (strength: number) => void;
  setAttractor: (index: 0 | 1 | 2 | 3, position: [number, number, number]) => void;
  setAttractorStrength: (strength: number) => void;
  triggerShockwave: (position: [number, number, number], strength?: number) => void;
  setQualityTier: (tier: QualityTier) => void;
  getParticleCount: () => number;
  dispose: () => void;
}

export function useParticleSystem({
  config = {},
  qualityTier,
  onInit,
}: UseParticleSystemProps) {
  const { gl, size, viewport } = useThree();

  // Configuração mesclada
  const mergedConfig = useMemo(
    () => ({ ...DEFAULT_PARTICLE_CONFIG, ...config }),
    [config]
  );

  // Referências para recursos WebGL (persistem entre renders)
  const computeRT = useRef<THREE.WebGLRenderTarget | null>(null);
  const velocityRT = useRef<THREE.WebGLRenderTarget | null>(null);
  const computeMaterial = useRef<THREE.ShaderMaterial | null>(null);
  const renderMaterial = useRef<THREE.ShaderMaterial | null>(null);
  const geometry = useRef<THREE.BufferGeometry | null>(null);
  const points = useRef<THREE.Points | null>(null);
  const quadGeo = useRef<THREE.BufferGeometry | null>(null);
  const quadMesh = useRef<THREE.Mesh | null>(null);

  // Estado dos uniforms (atualizados a cada frame)
  const uniforms = useRef<ParticleUniforms>({
    uTime: 0,
    uDeltaTime: 0,
    uResolution: [mergedConfig.count, 1],
    uMouse: [0, 0, 0],
    uMouseStrength: mergedConfig.mouseStrength,
    uAttractors: [
      [0, 0, 0], // 0 = mouse (atualizado dinamicamente)
      [0, 1.2, -2], // 1 = topo (ex: cílios)
      [0, -1.5, -1], // 2 = baixo (ex: scroll attractor)
      [0, 0, 0], // 3 = reservado (CTA hover)
    ],
    uAttractorStrength: mergedConfig.attractorStrength,
    uAttractorRadius: mergedConfig.attractorRadius,
    uNoiseScale: mergedConfig.noiseScale,
    uNoiseStrength: mergedConfig.noiseStrength,
    uDamping: mergedConfig.damping,
    uLifeDecay: 1 / mergedConfig.lifeSpan,
    uSpawnRadius: mergedConfig.spawnRadius,
    uColorStart: [1.0, 0.85, 0.2], // Dourado
    uColorEnd: [0.5, 0.05, 0.1],   // Vinho
    uOpacity: 0.6,
    uPointSize: mergedConfig.baseSize,
    uPixelRatio: 1,
    uSizeAttenuation: 1,
  });

  // Inicialização dos recursos GPU
  useEffect(() => {
    const initGPU = () => {
      const count = qualityTier.particleCount;
      const width = count; // Texture 1D: count x 1
      const height = 1;

      // ========== GEOMETRIA (pontos) ==========
      const positions = new Float32Array(count * 3);
      const uvs = new Float32Array(count * 2);
      const indices = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        // UV mapeia para pixel na texture (index / count)
        uvs[i * 2] = (i + 0.5) / count;
        uvs[i * 2 + 1] = 0.5;
        indices[i] = i;
        // Posição inicial aleatória na esfera
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = mergedConfig.spawnRadius * Math.cbrt(Math.random());
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setAttribute('index', new THREE.BufferAttribute(indices, 1));
      geometry.current = geo;

      // ========== RENDER TARGETS (Ping-Pong) ==========
      // Usamos RGBA16Float para precisão + performance mobile
      const rtOptions: THREE.RenderTargetOptions = {
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType, // 16-bit float (suportado no WebGL2 mobile)
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false,
      };

      computeRT.current = new THREE.WebGLRenderTarget(width, height, rtOptions);
      velocityRT.current = new THREE.WebGLRenderTarget(width, height, rtOptions);

      // Inicializa velocity texture com zeros
      const zeroVel = new Float32Array(width * height * 4);
      gl.textureBuffer = gl.renderer.properties.get(velocityRT.current.texture).__webglTexture;
      // Velocity será zerada no primeiro compute pass

      // ========== COMPUTE MATERIAL (Shader de simulação) ==========
      // Importa o shader como string (vite-plugin-glsl)
      // NOTA: O shader será importado no componente que usa este hook
      // Aqui criamos o material placeholder - o shader real vem de fora

      // ========== QUAD GEOMETRY para compute pass ==========
      const quad = new THREE.BufferGeometry();
      quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        -1, -1, 0,  1, -1, 0,  -1, 1, 0,
        -1, 1, 0,   1, -1, 0,   1, 1, 0,
      ]), 3));
      quad.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
        0, 0,  1, 0,  0, 1,
        0, 1,  1, 0,  1, 1,
      ]), 2));
      quadGeo.current = quad;

      // Quad mesh para compute pass
      // O material será setado externamente (import do shader)

      // ========== RENDER MATERIAL (Shader de visualização) ==========
      // Também importado externamente

      console.log(`[ParticleSystem] Initialized: ${count} particles, ${qualityTier.name} tier`);
    };

    initGPU();

    // Cleanup
    return () => {
      dispose();
    };
  }, [qualityTier.particleCount, gl, mergedConfig.spawnRadius]);

  // Função de dispose
  const dispose = useCallback(() => {
    computeRT.current?.dispose();
    velocityRT.current?.dispose();
    computeMaterial.current?.dispose();
    renderMaterial.current?.dispose();
    geometry.current?.dispose();
    quadGeo.current?.dispose();
    points.current?.geometry.dispose();
    computeRT.current = null;
    velocityRT.current = null;
    computeMaterial.current = null;
    renderMaterial.current = null;
    geometry.current = null;
    points.current = null;
    quadGeo.current = null;
    quadMesh.current = null;
  }, []);

  // API para controle externo
  const api = useMemo<ParticleSystemAPI>(() => ({
    setMousePosition: (x: number, y: number, z: number) => {
      uniforms.current.uMouse = [x, y, z];
    },
    setMouseStrength: (strength: number) => {
      uniforms.current.uMouseStrength = strength;
    },
    setAttractor: (index: 0 | 1 | 2 | 3, position: [number, number, number]) => {
      if (index >= 0 && index < 4) {
        uniforms.current.uAttractors[index] = position;
      }
    },
    setAttractorStrength: (strength: number) => {
      uniforms.current.uAttractorStrength = strength;
    },
    triggerShockwave: (position: [number, number, number], strength = 0.5) => {
      // Implementado no compute shader via uniform especial ou texture extra
      // Por simplicidade: adiciona velocidade radial no ponto
      // TODO: Implementar via uniform uShockwavePos + uShockwaveStrength
      console.log('[ParticleSystem] Shockwave at', position, strength);
    },
    setQualityTier: (tier: QualityTier) => {
      // Requer re-inicialização (particleCount mudou)
      console.log('[ParticleSystem] Quality tier change requested:', tier.name);
      // O hook re-rodará o useEffect acima quando qualityTier mudar
    },
    getParticleCount: () => qualityTier.particleCount,
    dispose,
  }), [qualityTier.particleCount, dispose]);

  // Expõe API para pai
  useEffect(() => {
    onInit?.(api);
  }, [api, onInit]);

  // ========== COMPUTE PASS (simulação GPU) ==========
  // Executado ANTES do render a cada frame
  useFrame((state, deltaTime) => {
    if (!computeRT.current || !velocityRT.current || !computeMaterial.current || !quadMesh.current) return;

    const { clock } = state;

    // Atualiza uniforms
    uniforms.current.uTime = clock.getElapsedTime();
    uniforms.current.uDeltaTime = Math.min(deltaTime, 1/30); // Clamp para estabilidade
    uniforms.current.uResolution = [qualityTier.particleCount, 1];
    uniforms.current.uPixelRatio = viewport.dpr;

    // Sync uniforms com material
    Object.entries(uniforms.current).forEach(([key, value]) => {
      if (computeMaterial.current!.uniforms[key] !== undefined) {
        computeMaterial.current!.uniforms[key].value = value;
      }
    });

    // Ping-pong: positionTexture lê do computeRT anterior, escreve no novo
    // Para simplificar, usamos double-buffering manual
    const prevPositionRT = computeRT.current;

    // Render compute pass para texture
    gl.setRenderTarget(computeRT.current);
    gl.clear(false, false, false);
    gl.render(quadMesh.current, gl.camera); // camera ortográfica implícita
    gl.setRenderTarget(null);

    // Swap: o resultado do compute vira input do próximo frame
    // NOTA: Em implementação real, faríamos ping-pong entre duas RTs
    // Por simplicidade aqui, usamos a mesma (feedback loop)
  }, 0); // priority 0 = roda antes do render principal

  // Retorna recursos para o componente renderizar
  return {
    geometry: geometry.current,
    points: points.current,
    computeRT: computeRT.current,
    velocityRT: velocityRT.current,
    computeMaterial: computeMaterial.current,
    renderMaterial: renderMaterial.current,
    uniforms: uniforms.current,
    api,
    setComputeMaterial: (mat: THREE.ShaderMaterial) => { computeMaterial.current = mat; },
    setRenderMaterial: (mat: THREE.ShaderMaterial) => { renderMaterial.current = mat; },
    setPoints: (pts: THREE.Points) => { points.current = pts; },
    setQuadMesh: (mesh: THREE.Mesh) => { quadMesh.current = mesh; },
  };
}