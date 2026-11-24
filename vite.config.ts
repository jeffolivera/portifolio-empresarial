import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import glsl from 'vite-plugin-glsl';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    glsl({
      // Permite importar .glsl, .vert, .frag como strings
      defaultExtension: 'glsl',
      warnDuplicatedImports: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@portfolio': path.resolve(__dirname, './src/portfolio'),
    },
  },
  optimizeDeps: {
    // Pré-bundling para Three.js e R3F (evita problemas de HMR)
    include: [
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      '@react-three/postprocessing',
      'gsap',
      'zod',
    ],
    exclude: ['@supabase/supabase-js'], // Supabase carrega dinamicamente
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Code splitting manual para Three.js (pesado)
        manualChunks: {
          'three-vendor': ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
          'gsap-vendor': ['gsap'],
          'supabase-vendor': ['@supabase/supabase-js'],
        },
      },
    },
    // Chunk size warning limit (em KB)
    chunkSizeWarningLimit: 500,
  },
  server: {
    port: 5173,
    host: true, // Acesso via LAN para testar mobile
    open: true,
  },
  // Variáveis de ambiente expostas ao cliente (prefixo VITE_)
  envPrefix: 'VITE_',
});