// src/portfolio/routes/dev-particles.tsx
// Rota de desenvolvimento para testar ParticleSystem isolado
// Acesse em: http://localhost:5173/dev/particles

import { createFileRoute } from '@tanstack/react-router';
import { ParticleSystemDev } from '@portfolio/components/hero/ParticleSystem';
import { DEFAULT_PARTICLE_CONFIG } from '@portfolio/types';

export const Route = createFileRoute('/dev/particles')({
  head: () => ({
    title: 'Particle System Dev — JP Studio Portfolio',
    meta: [
      { name: 'description', content: 'Development sandbox for GPU particle system' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: DevParticlesPage,
});

function DevParticlesPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid #222',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        background: 'rgba(10,10,10,0.95)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <a href="/" style={{
            color: '#ffd933',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '18px',
          }}>
            ← Back to Portfolio
          </a>
          <span style={{ color: '#666', fontSize: '14px' }}>|</span>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 500 }}>
            Particle System Dev
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <a
            href="https://github.com/jpstudio/portfolio"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#888', fontSize: '13px', textDecoration: 'none' }}
          >
            View Source
          </a>
        </div>
      </header>

      {/* Main Canvas Area */}
      <main style={{
        height: 'calc(100vh - 72px)',
        width: '100%',
        position: 'relative',
      }}>
        <ParticleSystemDev
          config={DEFAULT_PARTICLE_CONFIG}
          initialQuality="high"
          style={{ width: '100%', height: '100%' }}
        />
      </main>

      {/* Footer Info */}
      <footer style={{
        padding: '16px 24px',
        borderTop: '1px solid #222',
        background: 'rgba(10,10,10,0.95)',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', fontSize: '13px', color: '#888' }}>
          <div>
            <strong>Config:</strong> {DEFAULT_PARTICLE_CONFIG.count} particles |
            {DEFAULT_PARTICLE_CONFIG.lifeSpan}s life |
            {DEFAULT_PARTICLE_CONFIG.baseSize}px base size
          </div>
          <div>
            <strong>Shaders:</strong> Compute (GPU) + Render (Additive Blending)
          </div>
          <div>
            <strong>Interactions:</strong> Mouse attract | Click shockwave | Quality tiers
          </div>
        </div>
      </footer>
    </div>
  );
}