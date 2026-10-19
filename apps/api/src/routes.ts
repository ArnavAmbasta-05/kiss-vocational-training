import { Router } from 'express';
import { healthRoutes } from './modules/health/health.routes';

/** Everything under /api/v1. Each module mounts its own router here. */
export function v1Routes(): Router {
  const router = Router();
  router.use('/health', healthRoutes());
  return router;
}
