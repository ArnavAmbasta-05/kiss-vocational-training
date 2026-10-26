import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  AnalyticsQuerySchema,
  PlacementListQuerySchema,
  PlacementSchema,
  type AnalyticsQuery,
  type PlacementInput,
  type PlacementListQuery,
} from '@vtmp/shared';
import { authenticate, authorize } from '../../core/auth';
import { asyncHandler } from '../../core/http';
import { validate } from '../../core/middleware';
import * as service from './analytics.service';

const actor = (req: Request) => ({ userId: req.user!.id, ip: req.ip ?? null });

/** /analytics — outcome analytics and placements (F20), Admin only. */
export function analyticsRoutes(): Router {
  const router = Router();
  router.use(authenticate, authorize('ADMIN'));
  router.get(
    '/outcomes',
    validate({ query: AnalyticsQuerySchema }),
    asyncHandler(async (req, res) => {
      const { cycleId } = req.query as unknown as AnalyticsQuery;
      res.set('Cache-Control', 'no-store').json(await service.outcomes(cycleId));
    }),
  );
  router.get(
    '/outcomes.csv',
    validate({ query: AnalyticsQuerySchema }),
    asyncHandler(async (req, res) => {
      const { cycleId } = req.query as unknown as AnalyticsQuery;
      const stamp = new Date().toISOString().slice(0, 10);
      res
        .set({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="outcomes-${stamp}.csv"`,
          'Cache-Control': 'private, no-store',
        })
        .send(await service.outcomesCsv(cycleId));
    }),
  );
  router.post(
    '/refresh',
    asyncHandler(async (_req, res) => {
      res.json(await service.refresh());
    }),
  );
  router.get(
    '/placements',
    validate({ query: PlacementListQuerySchema }),
    asyncHandler(async (req, res) => {
      res.json(await service.listPlacements(req.query as unknown as PlacementListQuery));
    }),
  );
  router.get(
    '/placements/candidates',
    validate({ query: z.object({ rollNo: z.string().trim().min(1).max(40) }) }),
    asyncHandler(async (req, res) => {
      res.json(await service.candidates((req.query as { rollNo: string }).rollNo));
    }),
  );
  router.post(
    '/placements',
    validate({ body: PlacementSchema }),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createPlacement(actor(req), req.body as PlacementInput));
    }),
  );
  router.delete(
    '/placements/:id',
    validate({ params: z.object({ id: z.string().uuid() }) }),
    asyncHandler(async (req, res) => {
      await service.deletePlacement(actor(req), req.params.id!);
      res.status(204).end();
    }),
  );
  return router;
}
