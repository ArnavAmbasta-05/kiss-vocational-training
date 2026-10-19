import { pinoHttp } from 'pino-http';
import type { RequestHandler } from 'express';
import { logger } from '../logger';

/** Structured request logs (method, path, status, latency). Credentials are never logged. */
export function requestLogger(): RequestHandler {
  return pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/api/v1/health' },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req: { id: unknown; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
