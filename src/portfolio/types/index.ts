// src/portfolio/types/index.ts — Tipos centrais do módulo portfolio

// ========== QUALITY TIERS ==========
export type QualityTierName = 'ultra' | 'high' | 'mid' | 'low';

export interface QualityTier {
  name: QualityTierName;
  particleCount: number;
  bloom: boolean;
  chromaticAberration: boolean;
  ssr: boolean; // Screen space reflections (futuro)
  shadowMap: boolean;
  anisotropy: number;
}

export const QUALITY_TIERS: QualityTier[] = [
  { name: 'ultra', particleCount: 30000, bloom: true, chromaticAberration: true, ssr: true, shadowMap: true, anisotropy: 16 },
  { name: 'high',  particleCount: 20000, bloom: true, chromaticAberration: false, ssr: false, shadowMap: true, anisotropy: 8 },
  { name: 'mid',   particleCount: 12000, bloom: false, chromaticAberration: false, ssr: false, shadowMap: false, anisotropy: 4 },
  { name: 'low',   particleCount: 6000,  bloom: false, chromaticAberration: false, ssr: false, shadowMap: false, anisotropy: 1 },
];

// ========== PARTICLE SYSTEM ==========
export interface ParticleSystemConfig {
  count: number;
  attractorStrength: number;
  noiseScale: number;
  noiseStrength: number;
  lifeSpan: number; // segundos
  baseSize: number; // pixels
  spawnRadius: number;
  attractorRadius: number;
  damping: number;
  mouseStrength: number;
}

export const DEFAULT_PARTICLE_CONFIG: ParticleSystemConfig = {
  count: 15000,
  attractorStrength: 0.02,
  noiseScale: 0.5,
  noiseStrength: 0.01,
  lifeSpan: 6.5,
  baseSize: 1.5,
  spawnRadius: 3.0,
  attractorRadius: 5.0,
  damping: 0.98,
  mouseStrength: 0.03,
};

export interface ParticleUniforms {
  uTime: number;
  uDeltaTime: number;
  uResolution: [number, number];
  uMouse: [number, number, number];
  uMouseStrength: number;
  uAttractors: [number, number, number][];
  uAttractorStrength: number;
  uAttractorRadius: number;
  uNoiseScale: number;
  uNoiseStrength: number;
  uDamping: number;
  uLifeDecay: number; // 1 / lifeSpan
  uSpawnRadius: number;
  uColorStart: [number, number, number];
  uColorEnd: [number, number, number];
  uOpacity: number;
  uPointSize: number;
  uPixelRatio: number;
  uSizeAttenuation: number;
}

// ========== PERFORMANCE ==========
export interface PerformanceMetrics {
  fps: number;
  frameTime: number; // ms
  memory: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  } | null;
  gpuTier: QualityTierName;
  isLowEndDevice: boolean;
  prefersReducedMotion: boolean;
  prefersHighContrast: boolean;
}

// ========== CASES (preview - schema completo em lib/case-schema.ts) ==========
export type CaseCategory =
  | 'branding'
  | 'web'
  | 'mobile'
  | 'motion'
  | '3d'
  | 'print'
  | 'photography'
  | 'other';

export interface CaseTech {
  name: string;
  icon?: string; // lucide icon name
  color?: string; // hex
}

export interface CaseAsset {
  type: 'image' | 'video' | 'model3d' | 'iframe' | 'lottie';
  src: string;
  poster?: string;
  alt: string;
  width?: number;
  height?: number;
  format?: 'glb' | 'gltf' | 'usdz';
  environment?: string;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
}

export interface CaseMetric {
  label: string;
  value: string;
  description?: string;
}

export interface CaseScene3D {
  enabled: boolean;
  modelUrl?: string;
  entryAnimation: 'flyIn' | 'dissolve' | 'scaleUp' | 'none';
  hotspots: Array<{
    position: [number, number, number];
    title: string;
    content: string;
    type: 'info' | 'video' | 'image' | 'link';
  }>;
}

export interface Case {
  id: string; // UUID
  slug: string;
  title: string;
  shortDescription: string;
  category: CaseCategory;
  tags: string[];
  featured: boolean;
  order: number;
  cover: CaseAsset;
  gallery: CaseAsset[];
  description: string; // Markdown/HTML
  challenge?: string;
  solution?: string;
  results: CaseMetric[];
  techStack: CaseTech[];
  role?: string;
  duration?: string;
  teamSize?: number;
  liveUrl?: string;
  repoUrl?: string;
  caseStudyUrl?: string;
  clientName?: string;
  clientLogo?: string;
  publishedAt: string; // ISO 8601
  updatedAt?: string;
  status: 'published' | 'draft' | 'archived';
  scene3d?: CaseScene3D;
}

// ========== ENV ==========
export interface EnvConfig {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  VITE_R2_PUBLIC_URL: string; // ex: https://cdn.seudominio.com
  VITE_PORTFOLIO_HDRI_URL: string; // ex: /portfolio/hdri/studio_soft_2k.hdr
  VITE_PORTFOLIO_ASSET_BASE: string; // ex: /portfolio/
}