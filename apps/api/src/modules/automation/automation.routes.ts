import { Router } from 'express';
import { AutomationSettingsSchema, type AutomationSettings } from '@vtmp/shared';
import { authenticate, authorize } from '../../core/auth';
import { certificateEvents } from '../../core/events';
import { asyncHandler } from '../../core/http';
import { idempotency, validate } from '../../core/middleware';
import * as service from './automation.service';

const actor = (req: { user?: { id: string }; ip?: string }) => ({
  userId: req.user!.id,
  ip: req.ip ?? null,
});

/** /admin/automation — the admin's automation switches, the last daily run, and Run now. */
export function adminAutomationRoutes(): Router {
  const router = Router();
  router.use(authenticate, authorize('ADMIN'));
  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.status());
    }),
  );
  router.put(
    '/',
    validate({ body: AutomationSettingsSchema }),
    asyncHandler(async (req, res) => {
      res.json(await service.setAutomationSettings(actor(req), req.body as AutomationSettings));
    }),
  );
  router.post(
    '/run',
    idempotency(),
    asyncHandler(async (_req, res) => {
      res.json(await service.runDaily());
    }),
  );
  return router;
}

/** A8: core announces certificates; analytics refreshes from here (core never imports it). */
export function registerAutomationHooks(): void {
  // The same function each time: the app is built many times in tests, handlers are a set.
  certificateEvents.onIssued(service.refreshAnalyticsAfterCertificate);
}
