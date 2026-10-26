import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  ActionCreateSchema,
  ActionUpdateSchema,
  RiskFlagQuerySchema,
  type ActionCreateInput,
  type ActionUpdateInput,
  type RiskFlagQuery,
} from '@vtmp/shared';
import {
  authenticate,
  authorize,
  canAccessBatch,
  requireOwnership,
  type Resolver,
} from '../../core/auth';
import { batchEvents } from '../../core/events';
import { asyncHandler } from '../../core/http';
import { validate } from '../../core/middleware';
import * as service from './intervention.service';

const uuid = z.string().uuid();
const isUuid = (v: string) => uuid.safeParse(v).success;
const viewer = (req: Request) => ({
  userId: req.user!.id,
  role: req.user!.role,
  trainerId: req.user!.trainerId,
  ip: req.ip ?? null,
});
const staff = [authenticate, authorize('TRAINER', 'ADMIN')];

/** A flag or action belongs to a batch: admins see all, trainers their own batches (BR-05). */
const viaBatch =
  (param: string, batchOf: (id: string) => Promise<string | null>): Resolver =>
  async (req) => {
    const id = String(req.params[param] ?? '');
    if (!isUuid(id)) return 'not_found';
    const batchId = await batchOf(id);
    return batchId ? canAccessBatch(req.user!, batchId) : 'not_found';
  };

/**
 * Re-evaluates a batch after its attendance, marks or ratings change (TAD §8.2 step 6). Wired
 * from routes.ts so core modules announce the change without importing this module.
 */
export function registerInterventionHooks(): void {
  batchEvents.onDataChanged(service.evaluateBatch);
}

/** /risk-flags — BRQ-11.2–11.4 for trainers (own batches) and admins. */
export function riskFlagRoutes(): Router {
  const router = Router();
  router.get(
    '/',
    ...staff,
    validate({ query: RiskFlagQuerySchema }),
    asyncHandler(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await service.listFlags(viewer(req), req.query as unknown as RiskFlagQuery));
    }),
  );
  // Admin: run the evaluation now (the same job the daily cron runs).
  router.post(
    '/evaluate',
    authenticate,
    authorize('ADMIN'),
    asyncHandler(async (_req, res) => {
      res.json(await service.evaluateAll());
    }),
  );
  router.get(
    '/:flagId',
    ...staff,
    requireOwnership(viaBatch('flagId', service.batchOfFlag)),
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.flagDetail(req.params.flagId!));
    }),
  );
  router.post(
    '/:flagId/actions',
    ...staff,
    requireOwnership(viaBatch('flagId', service.batchOfFlag)),
    validate({ body: ActionCreateSchema }),
    asyncHandler(async (req, res) => {
      res
        .status(201)
        .json(
          await service.createAction(
            viewer(req),
            req.params.flagId!,
            req.body as ActionCreateInput,
          ),
        );
    }),
  );
  return router;
}

/** /risk-actions/:actionId — record an action's outcome. */
export function riskActionRoutes(): Router {
  const router = Router();
  router.patch(
    '/:actionId',
    ...staff,
    requireOwnership(viaBatch('actionId', service.batchOfAction)),
    validate({ body: ActionUpdateSchema }),
    asyncHandler(async (req, res) => {
      res.json(
        await service.updateAction(
          viewer(req),
          req.params.actionId!,
          req.body as ActionUpdateInput,
        ),
      );
    }),
  );
  return router;
}

/** /students/me/risk — the student's own supportive view (BRQ-11.5). */
export function studentRiskRoutes(): Router {
  const router = Router();
  router.get(
    '/me/risk',
    authenticate,
    authorize('STUDENT'),
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.myRisk(req.user!.studentId!));
    }),
  );
  return router;
}
