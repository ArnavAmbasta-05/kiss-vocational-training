import { Router } from 'express';
import { z } from 'zod';
import { NotificationListQuerySchema } from '@vtmp/shared';
import { authenticate } from '../../core/auth';
import { asyncHandler } from '../../core/http';
import { validate } from '../../core/middleware';
import * as service from './notifications.service';

const IdParams = z.object({ id: z.string().uuid() });

/** /notifications — the signed-in user's in-app notifications (any role). */
export function notificationRoutes(): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    '/me',
    validate({ query: NotificationListQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof NotificationListQuerySchema>;
      res.set('Cache-Control', 'no-store').json(await service.listMine(req.user!.id, query));
    }),
  );
  router.post(
    '/me/read-all',
    asyncHandler(async (req, res) => {
      res.json({ updated: await service.markAllRead(req.user!.id) });
    }),
  );
  router.post(
    '/:id/read',
    validate({ params: IdParams }),
    asyncHandler(async (req, res) => {
      await service.markRead(req.user!.id, req.params.id!);
      res.status(204).end();
    }),
  );
  return router;
}
