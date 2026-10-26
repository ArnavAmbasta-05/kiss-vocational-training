import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type RequestHandler } from 'express';
import { config } from './core/config';
import { AppError } from './core/errors';
import { asyncHandler } from './core/http';
import { refresh } from './modules/analytics/analytics.service';
import { evaluateAll } from './modules/intervention/intervention.service';

const digest = (v: string) => createHash('sha256').update(v).digest();

/** Bearer CRON_SECRET, compared in constant time. With no secret configured, nothing passes. */
function cronAuthorised(req: Request): boolean {
  const secret = config().CRON_SECRET;
  const header = req.get('authorization') ?? '';
  if (!secret || !header.startsWith('Bearer ')) return false;
  return timingSafeEqual(digest(header.slice(7)), digest(secret));
}

const job = (fn: () => Promise<unknown>): RequestHandler =>
  asyncHandler(async (req, res) => {
    if (!cronAuthorised(req)) throw AppError.unauthorized('Invalid job credentials');
    res.set('Cache-Control', 'no-store').json(await fn());
  });

/**
 * /internal/jobs — scheduled jobs (TAD §8.2, Amendment 1). Vercel Cron calls each path with GET
 * and `Authorization: Bearer $CRON_SECRET`; POST is accepted for manual runs with the same
 * secret. Locally node-cron runs the same jobs (src/jobs.ts).
 */
export function internalJobRoutes(): Router {
  const router = Router();
  const risk = job(() => evaluateAll());
  const analytics = job(() => refresh());
  router.get('/risk-evaluation', risk);
  router.post('/risk-evaluation', risk);
  router.get('/analytics-refresh', analytics);
  router.post('/analytics-refresh', analytics);
  return router;
}
