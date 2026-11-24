// src/portfolio/components/hero/ParticleSystem.tsx
// Componente principal do sistema de partículas - integra compute shader + render
// Usado standalone em /dev/particles ou dentro do Hero3D

import { useRef, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { useParticleSystem, ParticleSystemAPI } from '@portfolio/hooks/useParticleSystem';
import { usePerformance, QualityTier } from '@portfolio/hooks/usePerformance';
import { DEFAULT_PARTICLE_CONFIG, ParticleSystemConfig } from '@portfolio/types';

// Importa shaders como strings (vite-plugin-glsl)
import computeShader from '@portfolio/shaders/particle-compute.frag.glsl';
import vertexShader from '@portfolio/shaders/particle.vert.glsl';
import fragmentShader from '@portfolio/shaders/particle.frag.glsl';

// Estende Three.js para componentes customizados
extend({ THREE });

interface ParticleSystemProps {
  config?: Partial<ParticleSystemConfig>;
  initialQuality?: QualityTier['name'];
  onReady?: (api: ParticleSystemAPI) => void;
  className?: string;
  style?: React.CSSProperties;
}

// Componente interno que roda dentro do Canvas (tem acesso ao Three.js context)
function ParticleSystemInner({
  config,
  initialQuality = 'high',
  onReady,
}: ParticleSystemProps) {
  const { gl, size, viewport, camera } = useThree();

  // Performance monitor
  const { currentTier, metrics, setTier } = usePerformance({ initialTier: initialQuality });

  // Particle system hook
  const particleSystem = useParticleSystem({
    config,
    qualityTier: currentTier,
    onInit: onReady,
  });

  // ========== CRIAÇÃO DOS MATERIAIS ==========
  // Feita uma vez via useMemo
  const computeMaterial = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        positionTexture: { value: null },
        velocityTexture: { value: null },
        lifeTexture: { value: null },
        uTime: { value: 0 },
        uDeltaTime: { value: 1/60 },
        uResolution: { value: new THREE.Vector2(currentTier.particleCount, 1) },
        uMouse: { value: new THREE.Vector3(0, 0, 0) },
        uMouseStrength: { value: DEFAULT_PARTICLE_CONFIG.mouseStrength },
        uAttractors: { value: [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 1.2, -2),
          new THREE.Vector3(0, -1.5, -1),
          new THREE.Vector3(0, 0, 0),
        ]},
        uAttractorStrength: { value: DEFAULT_PARTICLE_CONFIG.attractorStrength },
        uAttractorRadius: { value: DEFAULT_PARTICLE_CONFIG.attractorRadius },
        uNoiseScale: { value: DEFAULT_PARTICLE_CONFIG.noiseScale },
        uNoiseStrength: { value: DEFAULT_PARTICLE_CONFIG.noiseStrength },
        uDamping: { value: DEFAULT_PARTICLE_CONFIG.damping },
        uLifeDecay: { value: 1 / DEFAULT_PARTICLE_CONFIG.lifeSpan },
        uSpawnRadius: { value: DEFAULT_PARTICLE_CONFIG.spawnRadius },
      },
      fragmentShader: computeShader,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    return material;
  }, [currentTier.particleCount]);

  const renderMaterial = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        positionTexture: { value: particleSystem.computeRT?.texture || null },
        uPointSize: { value: DEFAULT_PARTICLE_CONFIG.baseSize },
        uPixelRatio: { value: viewport.dpr },
        uSizeAttenuation: { value: 1.0 },
        uColorStart: { value: new THREE.Color(0xffd933) }, // Dourado
        uColorEnd: { value: new THREE.Color(0x800d1a) },   // Vinho
        uOpacity: { value: 0.6 },
        uGradientTexture: { value: null },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // Glow effect
      vertexColors: false,
    });
    return material;
  }, [viewport.dpr]);

  // Sincroniza materials com particleSystem refs
  useEffect(() => {
    particleSystem.setComputeMaterial(computeMaterial);
    particleSystem.setRenderMaterial(renderMaterial);
  }, [computeMaterial, renderMaterial, particleSystem]);

  // ========== PONTOS (MESH) ==========
  const pointsRef = useRef<THREE.Points | null>(null);

  useEffect(() => {
    if (!particleSystem.geometry) return;

    const points = new THREE.Points(particleSystem.geometry, renderMaterial);
    points.frustumCulled = false; // Partículas podem estar fora do frustum mas visíveis
    pointsRef.current = points;
    particleSystem.setPoints(points);

    return () => {
      points.geometry.dispose();
      points.material.dispose();
    };
  }, [particleSystem.geometry, renderMaterial, particleSystem]);

  // ========== QUAD MESH PARA COMPUTE PASS ==========
  const quadMeshRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    if (!particleSystem.computeRT) return;

    const quadGeo = new THREE.BufferGeometry();
    quadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0,  1, -1, 0,  -1, 1, 0,
      -1, 1, 0,   1, -1, 0,   1, 1, 0,
    ]), 3));
    quadGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0, 0,  1, 0,  0, 1,
      0, 1,  1, 0,  1, 1,
    ]), 2));

    const quadMesh = new THREE.Mesh(quadGeo, computeMaterial);
    quadMesh.frustumCulled = false;
    quadMeshRef.current = quadMesh;
    particleSystem.setQuadMesh(quadMesh);

    return () => {
      quadGeo.dispose();
    };
  }, [computeMaterial, particleSystem]);

  // ========== COMPUTE PASS (roda antes do render) ==========
  useFrame((state, deltaTime) => {
    if (!particleSystem.computeRT || !quadMeshRef.current || !computeMaterial) return;

    const { clock } = state;
    const count = currentTier.particleCount;

    // Atualiza uniforms do compute
    computeMaterial.uniforms.uTime.value = clock.getElapsedTime();
    computeMaterial.uniforms.uDeltaTime.value = Math.min(deltaTime, 1/30);
    computeMaterial.uniforms.uResolution.value.set(count, 1);
    computeMaterial.uniforms.uPixelRatio.value = viewport.dpr;

    // Sync uniforms do hook
    const u = particleSystem.uniforms;
    computeMaterial.uniforms.uMouse.value.set(...u.uMouse);
    computeMaterial.uniforms.uMouseStrength.value = u.uMouseStrength;
    computeMaterial.uniforms.uAttractorStrength.value = u.uAttractorStrength;
    computeMaterial.uniforms.uAttractorRadius.value = u.uAttractorRadius;
    computeMaterial.uniforms.uNoiseScale.value = u.uNoiseScale;
    computeMaterial.uniforms.uNoiseStrength.value = u.uNoiseStrength;
    computeMaterial.uniforms.uDamping.value = u.uDamping;
    computeMaterial.uniforms.uLifeDecay.value = u.uLifeDecay;
    computeMaterial.uniforms.uSpawnRadius.value = u.uSpawnRadius;

    // Attractors (array de Vector3)
    u.uAttractors.forEach((attr, i) => {
      computeMaterial.uniforms.uAttractors.value[i].set(...attr);
    });

    // Texturas de entrada (ping-pong)
    computeMaterial.uniforms.positionTexture.value = particleSystem.computeRT.texture;
    // velocityTexture seria usada se tivéssemos double buffering completo

    // Render compute pass
    gl.setRenderTarget(particleSystem.computeRT);
    gl.clear(false, false, false);
    gl.render(quadMeshRef.current, gl.camera);
    gl.setRenderTarget(null);

    // Atualiza texture do render material
    renderMaterial.uniforms.positionTexture.value = particleSystem.computeRT.texture;
    renderMaterial.uniforms.uPixelRatio.value = viewport.dpr;
  }, -1); // Prioridade -1 = roda ANTES do render normal

  // ========== RENDER DOS PONTOS ==========
  // Adiciona à cena
  useEffect(() => {
    if (!pointsRef.current) return;

    // Adiciona à cena via Three.js direto (não via JSX para controle total)
    const scene = gl.scene;
    scene.add(pointsRef.current);

    return () => {
      scene.remove(pointsRef.current);
    };
  }, [gl.scene, particleSystem.geometry]);

  // Retorna null - o render é feito via Three.js direto
  return null;
}

// ========== WRAPPER COM CANVAS ==========
export function ParticleSystemCanvas({
  config,
  initialQuality = 'high',
  onReady,
  className,
  style,
}: ParticleSystemProps) {
  return (
    <Canvas
      className={className}
      style={style}
      camera={{ position: [0, 0, 5], fov: 45 }}
      gl={{
        preserveDrawingBuffer: true,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      }}
      shadows={false}
      dpr={[1, 2]} // Limita DPR para performance mobile
    >
      <ParticleSystemInner config={config} initialQuality={initialQuality} onReady={onReady} />
    </Canvas>
  );
}

// ========== COMPONENTE SIMPLES PARA USO EM /dev/particles ==========
export function ParticleSystemDev({
  config,
  initialQuality = 'high',
  className,
  style,
}: ParticleSystemProps & { showStats?: boolean }) {
  const [api, setApi] = useState<ParticleSystemAPI | null>(null);
  const { currentTier, metrics, setTier } = usePerformance({ initialTier: initialQuality });

  // Controles de debug
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!api) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    // Converte para world space aproximado (z = -2)
    api.setMousePosition(x * 3, y * 2, -2);
  };

  const handleMouseLeave = () => {
    if (!api) return;
    api.setMousePosition(0, 0, 0);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!api) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    api.triggerShockwave([x * 3, y * 2, -2], 0.8);
  };

  return (
    <div
      className={className}
      style={{ ...style, position: 'relative', width: '100%', height: '100%' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <ParticleSystemCanvas
        config={config}
        initialQuality={initialQuality}
        onReady={setApi}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* Stats overlay */}
      {metrics && (
        <div style={{
          position: 'absolute',
          top: 12,
          left: 12,
          padding: '8px 12px',
          background: 'rgba(0,0,0,0.7)',
          color: '#0f0',
          fontFamily: 'monospace',
          fontSize: '12px',
          borderRadius: '4px',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          <div>FPS: {metrics.fps} ({metrics.frameTime}ms)</div>
          <div>Tier: {currentTier.name} ({currentTier.particleCount} pts)</div>
          <div>Bloom: {currentTier.bloom ? 'ON' : 'OFF'}</div>
          <div>Chromatic: {currentTier.chromaticAberration ? 'ON' : 'OFF'}</div>
          <div>Low-end: {metrics.isLowEndDevice ? 'YES' : 'NO'}</div>
          <div>Reduced Motion: {metrics.prefersReducedMotion ? 'YES' : 'NO'}</div>
          {metrics.memory && (
            <div>JS Heap: {(metrics.memory.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB</div>
          )}
        </div>
      )}

      {/* Controles de qualidade */}
      <div style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        display: 'flex',
        gap: '8px',
        zIndex: 10,
      }}>
        {['ultra', 'high', 'mid', 'low'].map(tier => (
          <button
            key={tier}
            onClick={() => setTier(tier as any)}
            style={{
              padding: '6px 12px',
              background: currentTier.name === tier ? '#ffd933' : 'rgba(255,255,255,0.2)',
              color: currentTier.name === tier ? '#000' : '#fff',
              border: '1px solid #ffd933',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              textTransform: 'uppercase',
            }}
          >
            {tier}
          </button>
        ))}
      </div>

      {/* Instruções */}
      <div style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        padding: '8px 12px',
        background: 'rgba(0,0,0,0.7)',
        color: '#fff',
        fontFamily: 'monospace',
        fontSize: '11px',
        borderRadius: '4px',
        pointerEvents: 'none',
        zIndex: 10,
        maxWidth: '280px',
        lineHeight: 1.5,
      }}>
        <strong>Controles:</strong><br/>
        🖱️ Mouse = Atrair partículas<br/>
        👆 Click = Shockwave<br/>
        ⌨️ Botões = Mudar quality tier
      </div>
    </div>
  );
}

// Import useState para o componente Dev
import { useState } from 'react';

export default ParticleSystemCanvas;