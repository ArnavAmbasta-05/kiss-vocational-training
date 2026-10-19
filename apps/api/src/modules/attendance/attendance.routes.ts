import { Router, type Request } from 'express';
import { z } from 'zod';
import { AttendanceSaveSchema, type AttendanceSaveInput } from '@vtmp/shared';
import { authenticate, authorize, owns, requireOwnership } from '../../core/auth';
import { AppError } from '../../core/errors';
import { asyncHandler } from '../../core/http';
import { validate } from '../../core/middleware';
import * as service from './attendance.service';

const SessionParams = z.object({ sessionId: z.string().uuid() });
const BatchParams = z.object({ batchId: z.string().uuid() });
const RangeQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

const viewer = (req: Request) => ({
  userId: req.user!.id,
  role: req.user!.role,
  ip: req.ip ?? null,
});

/** /sessions — attendance sheets (trainer of the batch, or admin). */
export function sessionRoutes(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    '/mine',
    authorize('TRAINER'),
    validate({ query: RangeQuery }),
    asyncHandler(async (req, res) => {
      const q = req.query as z.infer<typeof RangeQuery>;
      const day = 86_400_000;
      const from = q.from ? new Date(q.from) : new Date(Date.now() - 14 * day);
      const to = q.to ? new Date(q.to) : new Date(Date.now() + 30 * day);
      if (!req.user!.trainerId) throw AppError.forbidden();
      res
        .set('Cache-Control', 'no-store')
        .json(await service.mySessions(req.user!.trainerId, from, to));
    }),
  );
  router.get(
    '/:sessionId/attendance',
    authorize('TRAINER', 'ADMIN'),
    requireOwnership(owns.session()),
    validate({ params: SessionParams }),
    asyncHandler(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await service.sheet(viewer(req), req.params.sessionId!));
    }),
  );
  router.put(
    '/:sessionId/attendance',
    authorize('TRAINER', 'ADMIN'),
    requireOwnership(owns.session()),
    validate({ params: SessionParams, body: AttendanceSaveSchema }),
    asyncHandler(async (req, res) => {
      await service.save(viewer(req), req.params.sessionId!, req.body as AttendanceSaveInput);
      res.json(await service.sheet(viewer(req), req.params.sessionId!));
    }),
  );
  return router;
}

/** /batches/:batchId/attendance-summary — per-student figures (BRQ-5.3). */
export function batchAttendanceRoutes(): Router {
  const router = Router();
  router.get(
    '/:batchId/attendance-summary',
    authenticate,
    authorize('TRAINER', 'ADMIN'),
    requireOwnership(owns.batch()),
    validate({ params: BatchParams }),
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.batchSummary(req.params.batchId!));
    }),
  );
  return router;
}
