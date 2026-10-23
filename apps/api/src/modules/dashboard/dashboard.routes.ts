import { Router } from 'express';
import { AdminDashboardQuerySchema } from '@vtmp/shared';
import { authenticate, authorize } from '../../core/auth';
import { asyncHandler } from '../../core/http';
import { validate } from '../../core/middleware';
import * as service from './dashboard.service';

/** /dashboard/{admin,trainer,student} — each role sees only its own figures (BRQ-1.2, 9.1–9.3). */
export function dashboardRoutes(): Router {
  const router = Router();
  router.get(
    '/admin',
    authenticate,
    authorize('ADMIN'),
    validate({ query: AdminDashboardQuerySchema }),
    asyncHandler(async (req, res) => {
      const { cycleId } = req.query as { cycleId?: string };
      res.set('Cache-Control', 'no-store').json(await service.admin(cycleId));
    }),
  );
  router.get(
    '/trainer',
    authenticate,
    authorize('TRAINER'),
    asyncHandler(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await service.trainer({ role: 'TRAINER', trainerId: req.user!.trainerId! }));
    }),
  );
  router.get(
    '/student',
    authenticate,
    authorize('STUDENT'),
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.student(req.user!.studentId!));
    }),
  );
  return router;
}
