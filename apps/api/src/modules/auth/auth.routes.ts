import { Router } from 'express';
import { LoginSchema } from '@vtmp/shared';
import { authenticate } from '../../core/auth';
import { rateLimiter, validate } from '../../core/middleware';
import { settings } from '../../core/settings';
import * as controller from './auth.controller';

export function authRoutes(): Router {
  const router = Router();
  // Per-IP limit on failed sign-ins, on top of the per-account lockout. Successful logins and
  // refreshes (one per page load) do not count, so normal use never hits it.
  const loginLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: () => settings.get('auth.ipRateLimitPer15Min'),
    skipSuccessfulRequests: true,
    name: 'login',
  });
  router.post('/login', loginLimiter, validate({ body: LoginSchema }), controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', authenticate, controller.me);
  return router;
}
