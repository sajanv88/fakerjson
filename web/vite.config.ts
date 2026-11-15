import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const api = 'http://localhost:3000';

/**
 * The landing page. `vite build` writes static files to ../public, which the Nest app
 * serves at `/`. In development, `pnpm dev:web` proxies API calls to the Nest server.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../public', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    // Hashed files under /assets are cached for a year by the server.
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': api,
      '/docs': api,
      '/openapi.json': api,
      '/openapi.yaml': api,
      '/health': api,
    },
  },
});
