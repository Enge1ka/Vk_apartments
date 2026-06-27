import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Opt-in only (ANALYZE=true npm run build) — writes dist/stats.html.
    // Must not run on every production build: Netlify/Vercel publish the
    // whole dist/ folder, so an always-on stats.html would be a publicly
    // reachable bundle/dependency breakdown at your real domain.
    process.env.ANALYZE && visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true }),
  ].filter(Boolean),
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
})
