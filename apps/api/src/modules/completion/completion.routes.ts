import { Router, type Request } from 'express';
import { z } from 'zod';
import { NotCompletedSchema, type NotCompletedInput } from '@vtmp/shared';
import { authenticate, authorize } from '../../core/auth';
import { asyncHandler } from '../../core/http';
import { idempotency, validate } from '../../core/middleware';
import * as service from './completion.service';

const uuid = z.string().uuid();
const EnrollmentParams = z.object({ enrollmentId: uuid });
const CertificateParams = z.object({ certificateId: uuid });
const QueueQuery = z.object({ batchId: uuid });
const EmptyBody = z.object({}).strict().optional();

const actor = (req: Request) => ({ userId: req.user!.id, ip: req.ip ?? null });
const admin = [authenticate, authorize('ADMIN')];

/** /completions — Admin only (BRQ-7.1, BRQ-9.4, TAD §8.1). */
export function completionRoutes(): Router {
  const router = Router();
  router.get(
    '/queue',
    ...admin,
    validate({ query: QueueQuery }),
    asyncHandler(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await service.queue((req.query as z.infer<typeof QueueQuery>).batchId));
    }),
  );
  router.post(
    '/:enrollmentId/approve',
    ...admin,
    validate({ params: EnrollmentParams, body: EmptyBody }),
    idempotency(),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.approve(actor(req), req.params.enrollmentId!));
    }),
  );
  router.post(
    '/:enrollmentId/not-completed',
    ...admin,
    validate({ params: EnrollmentParams, body: NotCompletedSchema }),
    idempotency(),
    asyncHandler(async (req, res) => {
      res.json(
        await service.markNotCompleted(
          actor(req),
          req.params.enrollmentId!,
          (req.body as NotCompletedInput).reason,
        ),
      );
    }),
  );
  return router;
}

/** POST /certificates/:certificateId/render — Admin retry after a failed render (UC-04 4a). */
export function certificateRenderRoutes(): Router {
  const router = Router();
  router.post(
    '/:certificateId/render',
    ...admin,
    validate({ params: CertificateParams, body: EmptyBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.retryRender(actor(req), req.params.certificateId!));
    }),
  );
  return router;
}
