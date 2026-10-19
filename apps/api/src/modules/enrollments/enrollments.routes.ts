import { Router } from 'express';
import { z } from 'zod';
import {
  AdminEnrollmentQuerySchema,
  BulkReviewSchema,
  EnrollmentSubmitSchema,
  EnrollmentUpdateSchema,
  RejectSchema,
  WaitlistSchema,
} from '@vtmp/shared';
import { authenticate, authorize, owns, requireOwnership } from '../../core/auth';
import { idempotency, validate } from '../../core/middleware';
import * as controller from './enrollments.controller';

const EnrollmentParams = z.object({ enrollmentId: z.string().uuid() });
const IdParams = z.object({ id: z.string().uuid() });
const EmptyBody = z.object({}).strict().optional();

/** /enrollments — students apply, track, edit and withdraw (BRQ-3.1, 3.2, 3.4). */
export function enrollmentRoutes(): Router {
  const router = Router();
  router.use(authenticate, authorize('STUDENT'));
  router.post('/', validate({ body: EnrollmentSubmitSchema }), idempotency(), controller.submit);
  router.get('/me', controller.mine);
  router.put(
    '/:enrollmentId',
    requireOwnership(owns.enrollment()),
    validate({ params: EnrollmentParams, body: EnrollmentUpdateSchema }),
    controller.update,
  );
  router.post(
    '/:enrollmentId/withdraw',
    requireOwnership(owns.enrollment()),
    validate({ params: EnrollmentParams }),
    controller.withdraw,
  );
  return router;
}

/** /admin/enrollments — review queue and decisions (BRQ-3.3, BR-12). */
export function adminEnrollmentRoutes(): Router {
  const router = Router();
  router.use(authenticate, authorize('ADMIN'));
  router.get('/', validate({ query: AdminEnrollmentQuerySchema }), controller.adminList);
  router.post('/bulk', validate({ body: BulkReviewSchema }), idempotency(), controller.bulk);
  router.post(
    '/:id/approve',
    validate({ params: IdParams, body: EmptyBody }),
    idempotency(),
    controller.approve,
  );
  router.post(
    '/:id/reject',
    validate({ params: IdParams, body: RejectSchema }),
    idempotency(),
    controller.reject,
  );
  router.post(
    '/:id/waitlist',
    validate({ params: IdParams, body: WaitlistSchema }),
    idempotency(),
    controller.waitlist,
  );
  return router;
}
