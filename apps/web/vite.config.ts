import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // One .env at the repo root serves both apps; only VITE_* reaches the browser.
  envDir: '../..',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Libraries change far less often than app code: separate chunks stay cached across
        // deploys, so a release only re-downloads the small app chunk (NFR-10). Vite module ids
        // always use forward slashes.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id))
            return 'vendor-react';
          if (/\/(zod|react-hook-form|@hookform)\//.test(id)) return 'vendor-forms';
          if (/\/(i18next|react-i18next|i18next-[\w-]+)\//.test(id)) return 'vendor-i18n';
          if (/\/@tanstack\//.test(id)) return 'vendor-query';
          return undefined;
        },
      },
    },
  },
});
