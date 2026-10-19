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
  },
});
