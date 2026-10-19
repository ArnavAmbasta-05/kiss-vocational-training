import express, { type Express } from 'express';
import { config } from './core/config';
import { errorHandler, notFoundHandler } from './core/errors';
import {
  corsAllowList,
  globalRateLimiter,
  requestLogger,
  securityHeaders,
} from './core/middleware';
import { healthRoutes } from './modules/health/health.routes';
import { v1Routes } from './routes';

/**
 * Builds the Express app without listening, so Supertest can import it.
 * Pipeline: helmet → CORS allow-list → logging → rate limiter → body parser → routes → errors.
 */
export function createApp(): Express {
  const env = config();
  const app = express();

  app.disable('x-powered-by');
  // Free-tier hosts terminate TLS at one proxy; needed for correct client IPs in rate limits.
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(securityHeaders());
  app.use(corsAllowList(env.CORS_ORIGINS));
  app.use(requestLogger());
  app.use(globalRateLimiter());
  app.use(express.json({ limit: '1mb' }));

  // Root-level health for uptime pingers; the same check lives at /api/v1/health.
  app.use('/health', healthRoutes());
  app.use('/api/v1', v1Routes());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
