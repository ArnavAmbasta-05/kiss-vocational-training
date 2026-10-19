import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import type { RequestHandler } from 'express';
import { AppError } from '../errors';

export function securityHeaders(): RequestHandler {
  return helmet();
}

const corsOptions: CorsOptions = {
  origin: true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'Accept-Language'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 600,
};

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * CORS allow-list: only configured origins may call the API from another site. Same-origin
 * requests always pass: browsers send an Origin header on POST even to their own origin, and
 * the API is served on the web app's origin (including Vercel's per-deployment URLs).
 */
export function corsAllowList(origins: string[]): RequestHandler {
  return cors((req, callback) => {
    const origin = req.headers.origin;
    // Non-browser clients send no Origin header.
    if (!origin) return callback(null, corsOptions);
    const sameOrigin = hostOf(origin) === req.headers.host;
    if (sameOrigin || origins.includes(origin)) return callback(null, corsOptions);
    callback(AppError.forbidden('Origin not allowed'));
  });
}
