import { Router } from 'express';
import { SchedulingCheckSchema, type SchedulingCheckInput } from '@vtmp/shared';
import { authenticate, authorize } from '../../core/auth';
import { asyncHandler } from '../../core/http';
import { validate } from '../../core/middleware';
import * as service from './scheduling.service';

/** /scheduling — the smart scheduling advisor (F14), Admin only, read-only. */
export function schedulingRoutes(): Router {
  const router = Router();
  router.post(
    '/check',
    authenticate,
    authorize('ADMIN'),
    validate({ body: SchedulingCheckSchema }),
    asyncHandler(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await service.check(req.body as SchedulingCheckInput));
    }),
  );
  return router;
}
