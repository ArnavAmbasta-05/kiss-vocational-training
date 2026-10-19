import { Router } from 'express';
import { authRoutes } from './modules/auth/auth.routes';
import { healthRoutes } from './modules/health/health.routes';
import { adminUserRoutes, meRoutes } from './modules/users/users.routes';

/** Everything under /api/v1. Each module mounts its own router here. */
export function v1Routes(): Router {
  const router = Router();
  router.use('/health', healthRoutes());
  router.use('/auth', authRoutes());
  router.use('/users', meRoutes());
  router.use('/admin/users', adminUserRoutes());
  return router;
}
