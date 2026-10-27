import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * /verify/<code> is served by the standalone verify.html (NFR-09), not the React app. Vercel
 * does this with a rewrite (vercel.json); this plugin does the same for `vite` and `vite preview`.
 */
function verifyPage(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    if (req.url && /^\/verify(\/|$|\?)/.test(req.url)) req.url = '/verify.html';
    next();
  };
  return {
    name: 'verify-page',
    configureServer: (server) => void server.middlewares.use(rewrite),
    configurePreviewServer: (server) => void server.middlewares.use(rewrite),
  };
}

export default defineConfig({
  plugins: [react(), verifyPage()],
  // One .env at the repo root serves both apps; only VITE_* reaches the browser.
  envDir: '../..',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  // The built app, served locally for Lighthouse and the k6 load test (perf/).
  preview: { port: 4173, strictPort: true, proxy: { '/api': 'http://localhost:4000' } },
  build: {
    target: 'es2020',
    sourcemap: true,
    // dist/.vite/manifest.json: scripts/check-bundle.mjs measures each page's first load.
    manifest: true,
    rollupOptions: {
      // Two pages: the app, and the tiny public verify page with no React in it.
      input: {
        main: resolve(__dirname, 'index.html'),
        verify: resolve(__dirname, 'verify.html'),
      },
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
