import { defineConfig } from 'tsup';

export default defineConfig({
  // server.ts: long-running server (local, CI). vercel.ts: serverless handler (production).
  entry: ['src/server.ts', 'src/vercel.ts'],
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Bundle the workspace package (shipped as TypeScript source); keep npm deps external.
  noExternal: ['@vtmp/shared'],
});
