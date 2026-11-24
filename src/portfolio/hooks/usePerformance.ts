// src/portfolio/hooks/usePerformance.ts
// Hook para monitorar performance e ajustar quality tier automaticamente

import { useEffect, useRef, useState, useCallback } from 'react';
import { QualityTier, QualityTierName, QUALITY_TIERS, PerformanceMetrics } from '@portfolio/types';

interface UsePerformanceOptions {
  initialTier?: QualityTierName;
  onTierChange?: (tier: QualityTier) => void;
  sampleInterval?: number; // ms entre amostras de FPS
  lowFPSThreshold?: number; // FPS abaixo do qual desce tier
  highFPSThreshold?: number; // FPS acima do qual sobe tier
  consecutiveLowFrames?: number; // frames consecutivos abaixo do threshold para descer
  consecutiveHighFrames?: number; // frames consecutivos acima do threshold para subir
}

export function usePerformance({
  initialTier = 'high',
  onTierChange,
  sampleInterval = 1000,
  lowFPSThreshold = 50,
  highFPSThreshold = 58,
  consecutiveLowFrames = 3,
  consecutiveHighFrames = 10,
}: UsePerformanceOptions = {}) {

  const [currentTierName, setCurrentTierName] = useState<QualityTierName>(initialTier);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    frameTime: 16.67,
    memory: null,
    gpuTier: initialTier,
    isLowEndDevice: false,
    prefersReducedMotion: false,
    prefersHighContrast: false,
  });

  const currentTier = QUALITY_TIERS.find(t => t.name === currentTierName) || QUALITY_TIERS[1];

  // Refs para contadores
  const lowFrameCount = useRef(0);
  const highFrameCount = useRef(0);
  const frameTimes = useRef<number[]>([]);
  const animationFrameId = useRef<number | null>(null);
  const lastTime = useRef(performance.now());
  const isMonitoring = useRef(false);

  // Detecta device capabilities uma vez
  const deviceInfo = useRef<{
    isLowEnd: boolean;
    prefersReducedMotion: boolean;
    prefersHighContrast: boolean;
    hardwareConcurrency: number;
    deviceMemory: number;
  } | null>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const prefersHighContrast = window.matchMedia('(prefers-contrast: more)').matches;
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    const deviceMemory = (navigator as any).deviceMemory || 4;

    const isLowEnd = hardwareConcurrency < 4 || deviceMemory < 4;

    deviceInfo.current = {
      isLowEnd,
      prefersReducedMotion,
      prefersHighContrast,
      hardwareConcurrency,
      deviceMemory,
    };

    // Se dispositivo low-end, força tier baixo inicial
    if (isLowEnd && initialTier !== 'low') {
      const lowTier = QUALITY_TIERS.find(t => t.name === 'low')!;
      setCurrentTierName('low');
      onTierChange?.(lowTier);
    }

    // Listeners para mudanças de preferência
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const contrastQuery = window.matchMedia('(prefers-contrast: more)');

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setMetrics(prev => ({ ...prev, prefersReducedMotion: e.matches }));
    };
    const handleContrastChange = (e: MediaQueryListEvent) => {
      setMetrics(prev => ({ ...prev, prefersHighContrast: e.matches }));
    };

    motionQuery.addEventListener('change', handleMotionChange);
    contrastQuery.addEventListener('change', handleContrastChange);

    return () => {
      motionQuery.removeEventListener('change', handleMotionChange);
      contrastQuery.removeEventListener('change', handleContrastChange);
    };
  }, [initialTier, onTierChange]);

  // Loop de medição de FPS
  const measureLoop = useCallback(() => {
    if (!isMonitoring.current) return;

    const now = performance.now();
    const delta = now - lastTime.current;
    lastTime.current = now;

    const fps = 1000 / delta;
    frameTimes.current.push(fps);

    // Mantém apenas últimas 120 amostras (2 segundos a 60fps)
    if (frameTimes.current.length > 120) {
      frameTimes.current.shift();
    }

    // Calcula FPS médio
    const avgFPS = frameTimes.current.reduce((a, b) => a + b, 0) / frameTimes.current.length;
    const frameTime = 1000 / avgFPS;

    // Memory info (Chrome only)
    let memory: PerformanceMetrics['memory'] = null;
    if ('memory' in performance) {
      const mem = (performance as any).memory;
      memory = {
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
      };
    }

    setMetrics(prev => ({
      ...prev,
      fps: Math.round(avgFPS),
      frameTime: Math.round(frameTime * 100) / 100,
      memory,
      gpuTier: currentTierName,
      isLowEndDevice: deviceInfo.current?.isLowEnd ?? false,
      prefersReducedMotion: deviceInfo.current?.prefersReducedMotion ?? false,
      prefersHighContrast: deviceInfo.current?.prefersHighContrast ?? false,
    }));

    // Lógica de ajuste de tier
    if (avgFPS < lowFPSThreshold) {
      lowFrameCount.current++;
      highFrameCount.current = 0;

      if (lowFrameCount.current >= consecutiveLowFrames) {
        // Desce tier
        const currentIndex = QUALITY_TIERS.findIndex(t => t.name === currentTierName);
        if (currentIndex > 0) {
          const newTier = QUALITY_TIERS[currentIndex - 1];
          console.log(`[Performance] FPS baixo (${Math.round(avgFPS)}) -> descendo para ${newTier.name}`);
          setCurrentTierName(newTier.name);
          onTierChange?.(newTier);
          lowFrameCount.current = 0; // Reset após mudança
        }
      }
    } else if (avgFPS > highFPSThreshold) {
      highFrameCount.current++;
      lowFrameCount.current = 0;

      if (highFrameCount.current >= consecutiveHighFrames) {
        // Sobe tier (com hysteresis - mais conservador)
        const currentIndex = QUALITY_TIERS.findIndex(t => t.name === currentTierName);
        if (currentIndex < QUALITY_TIERS.length - 1) {
          const newTier = QUALITY_TIERS[currentIndex + 1];
          console.log(`[Performance] FPS alto (${Math.round(avgFPS)}) -> subindo para ${newTier.name}`);
          setCurrentTierName(newTier.name);
          onTierChange?.(newTier);
          highFrameCount.current = 0;
        }
      }
    } else {
      // FPS na zona confortável - reset contadores lentamente
      lowFrameCount.current = Math.max(0, lowFrameCount.current - 1);
      highFrameCount.current = Math.max(0, highFrameCount.current - 1);
    }

    animationFrameId.current = requestAnimationFrame(measureLoop);
  }, [currentTierName, lowFPSThreshold, highFPSThreshold, consecutiveLowFrames, consecutiveHighFrames, onTierChange]);

  // Inicia/para monitoramento
  const startMonitoring = useCallback(() => {
    if (isMonitoring.current) return;
    isMonitoring.current = true;
    lastTime.current = performance.now();
    frameTimes.current = [];
    lowFrameCount.current = 0;
    highFrameCount.current = 0;
    animationFrameId.current = requestAnimationFrame(measureLoop);
  }, [measureLoop]);

  const stopMonitoring = useCallback(() => {
    isMonitoring.current = false;
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
  }, []);

  // Força tier específico (override manual)
  const setTier = useCallback((tierName: QualityTierName) => {
    const tier = QUALITY_TIERS.find(t => t.name === tierName);
    if (tier) {
      setCurrentTierName(tierName);
      onTierChange?.(tier);
    }
  }, [onTierChange]);

  // Auto-start no mount
  useEffect(() => {
    startMonitoring();
    return () => stopMonitoring();
  }, [startMonitoring, stopMonitoring]);

  return {
    currentTier,
    currentTierName,
    metrics,
    setTier,
    startMonitoring,
    stopMonitoring,
    QUALITY_TIERS,
  };
}

// Hook simplificado para usar em componentes que só precisam do tier atual
export function useQualityTier(initialTier: QualityTierName = 'high') {
  const { currentTier, currentTierName, setTier } = usePerformance({ initialTier });
  return { currentTier, currentTierName, setTier };
}