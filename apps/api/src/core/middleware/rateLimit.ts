import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { AppError, toErrorBody } from '../errors';

interface LimitOptions {
  windowMs: number;
  /** A number, or a function so the limit can come from a Setting at request time. */
  limit: number | (() => number | Promise<number>);
  /** Count only failed (4xx/5xx) responses, e.g. for login brute-force protection. */
  skipSuccessfulRequests?: boolean;
}

/** Rate limiter that answers with the standard error body (HTTP 429). */
export function rateLimiter({
  windowMs,
  limit,
  skipSuccessfulRequests,
}: LimitOptions): RequestHandler {
  return rateLimit({
    windowMs,
    limit: typeof limit === 'function' ? () => limit() : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
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
