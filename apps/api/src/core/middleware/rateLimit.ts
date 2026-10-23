import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { config } from '../config';
import { AppError, toErrorBody } from '../errors';
import { PostgresRateLimitStore } from './postgresRateLimitStore';

interface LimitOptions {
  windowMs: number;
  /** A number, or a function so the limit can come from a Setting at request time. */
  limit: number | (() => number | Promise<number>);
  /** Count only failed (4xx/5xx) responses, e.g. for login brute-force protection. */
  skipSuccessfulRequests?: boolean;
  /**
   * Naming a limiter makes it shared: with RATE_LIMIT_STORE=postgres its counts live in the
   * database, so every serverless instance enforces one limit. Use it for security limits.
   */
  name?: string;
}

/** Rate limiter that answers with the standard error body (HTTP 429). */
export function rateLimiter({
  windowMs,
  limit,
  skipSuccessfulRequests,
  name,
}: LimitOptions): RequestHandler {
  const shared = name && config().RATE_LIMIT_STORE === 'postgres';
  return rateLimit({
    windowMs,
    limit: typeof limit === 'function' ? () => limit() : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
    ...(shared ? { store: new PostgresRateLimitStore(name) } : {}),
    handler: (_req, res) => {
      const err = new AppError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.');
      res.status(429).json(toErrorBody(err));
    },
  });
}

/**
 * Global API limiter: generous flood protection, kept in memory (per instance) so ordinary
 * requests never wait on the database. Security limits are named and shared instead.
 */
export function globalRateLimiter(): RequestHandler {
  return rateLimiter({ windowMs: 15 * 60 * 1000, limit: config().GLOBAL_RATE_LIMIT_PER_15MIN });
}
