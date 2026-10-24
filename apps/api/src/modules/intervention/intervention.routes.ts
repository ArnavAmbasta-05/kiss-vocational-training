import { createHash, timingSafeEqual } from 'node:crypto';
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
import { config } from '../../core/config';
import { AppError } from '../../core/errors';
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

const digest = (v: string) => createHash('sha256').update(v).digest();

/** Bearer CRON_SECRET, compared in constant time. With no secret configured, nothing passes. */
function cronAuthorised(req: Request): boolean {
  const secret = config().CRON_SECRET;
  const header = req.get('authorization') ?? '';
  if (!secret || !header.startsWith('Bearer ')) return false;
  return timingSafeEqual(digest(header.slice(7)), digest(secret));
}

/**
 * /internal/jobs — scheduled jobs. Vercel Cron calls the path with GET and
 * `Authorization: Bearer $CRON_SECRET`; POST is accepted for manual runs with the same secret.
 */
export function internalJobRoutes(): Router {
  const router = Router();
  const run = asyncHandler(async (req, res) => {
    if (!cronAuthorised(req)) throw AppError.unauthorized('Invalid job credentials');
    res.set('Cache-Control', 'no-store').json(await service.evaluateAll());
  });
  router.get('/risk-evaluation', run);
  router.post('/risk-evaluation', run);
  return router;
}
