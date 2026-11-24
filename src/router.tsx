// src/router.tsx — Configuração do TanStack Router
import { createRouter, createRootRoute, createRoute, Outlet, Link } from '@tanstack/react-router';
import { devParticlesRoute } from '@portfolio/routes/dev-particles';

// Root layout
const rootRoute = createRootRoute({
  component: () => (
    <html lang="pt-BR">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style={{ margin: 0, minHeight: '100vh' }}>
        <Outlet />
      </body>
    </html>
  ),
});

// Rota home (placeholder - será implementada nas próximas fases)
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0a',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      padding: '24px',
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: 'clamp(32px, 8vw, 72px)', fontWeight: 300, marginBottom: '16px', letterSpacing: '-0.02em' }}>
        JP Studio
      </h1>
      <p style={{ fontSize: 'clamp(16px, 3vw, 24px)', color: '#ffd933', marginBottom: '32px', fontWeight: 500 }}>
        Portfolio 3D Interativo
      </p>
      <p style={{ maxWidth: '600px', color: '#aaa', marginBottom: '48px', lineHeight: 1.6 }}>
        Em desenvolvimento — Fase 1: Particle System Core
      </p>
      <nav style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link
          to="/dev/particles"
          style={{
            padding: '12px 24px',
            background: '#ffd933',
            color: '#000',
            textDecoration: 'none',
            borderRadius: '4px',
            fontWeight: 600,
            fontSize: '14px',
            transition: 'background 0.2s',
          }}
        >
          Testar Particle System →
        </Link>
        <a
          href="/portfolio"
          style={{
            padding: '12px 24px',
            background: 'transparent',
            color: '#fff',
            textDecoration: 'none',
            border: '1px solid #333',
            borderRadius: '4px',
            fontWeight: 500,
            fontSize: '14px',
          }}
        >
          Portfolio (em breve)
        </a>
      </nav>
    </div>
  ),
});

// Rota portfolio (placeholder)
const portfolioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/portfolio',
  component: () => (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0a',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      padding: '24px',
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: '48px', fontWeight: 300, marginBottom: '16px' }}>
        Portfolio
      </h1>
      <p style={{ color: '#888' }}>Grid de cases — Fase 3</p>
    </div>
  ),
});

// Monta o router
export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    portfolioRoute,
    devParticlesRoute,
  ]),
  // Configurações de scroll restoration
  scrollRestoration: true,
  // Default preload behavior
  defaultPreload: 'intent',
  // Error boundary
  defaultErrorComponent: ({ error, reset }) => (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0a',
      color: '#fff',
      padding: '24px',
      textAlign: 'center',
    }}>
      <h2>Erro</h2>
      <pre style={{ color: '#ff6b6b', textAlign: 'left', maxWidth: '600px' }}>
        {error?.message || 'Erro desconhecido'}
      </pre>
      <button
        onClick={() => reset()}
        style={{ marginTop: '16px', padding: '12px 24px', background: '#ffd933', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
      >
        Tentar novamente
      </button>
    </div>
  ),
});

// Tipagem para type-safe routing
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}