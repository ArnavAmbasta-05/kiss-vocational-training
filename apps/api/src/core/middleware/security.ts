import cors from 'cors';
import helmet from 'helmet';
import type { RequestHandler } from 'express';
import { AppError } from '../errors';

export function securityHeaders(): RequestHandler {
  return helmet();
}

/** CORS allow-list: only configured origins may call the API from a browser. */
export function corsAllowList(origins: string[]): RequestHandler {
  return cors({
    origin(origin, callback) {
      // Same-origin requests and non-browser clients send no Origin header.
      if (!origin || origins.includes(origin)) return callback(null, true);
      callback(AppError.forbidden('Origin not allowed'));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'Accept-Language'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  });
}
