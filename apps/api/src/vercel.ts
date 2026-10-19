import { createApp } from './app';

/**
 * Vercel serverless entry (bundled to dist/vercel.js, loaded by /api/index.js at the repo root).
 * An Express app is itself a (req, res) handler, so it is exported as-is. A warm function
 * instance reuses the app and its Prisma client; there is no listen() and no shutdown hook.
 */
const app = createApp();

export default app;
