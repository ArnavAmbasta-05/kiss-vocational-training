import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { AppError, toErrorBody } from '../errors';

interface LimitOptions {
  windowMs: number;
  limit: number;
}

/** Rate limiter that answers with the standard error body (HTTP 429). */
export function rateLimiter({ windowMs, limit }: LimitOptions): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      const err = new AppError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.');
      res.status(429).json(toErrorBody(err));
    },
  });
}

/** Global API limiter: generous, protects against floods. Stricter limits are added per router. */
export function globalRateLimiter(): RequestHandler {
  return rateLimiter({ windowMs: 15 * 60 * 1000, limit: 1000 });
}
