import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  JobRoleSchema,
  OpportunityListQuerySchema,
  OpportunitySchema,
  type JobRoleInput,
  type OpportunityInput,
  type OpportunityListQuery,
} from '@vtmp/shared';
import { authenticate, authorize } from '../../core/auth';
import { asyncHandler } from '../../core/http';
import { validate } from '../../core/middleware';
import * as service from './opportunities.service';

const id = z.object({ id: z.string().uuid() });
const actor = (req: Request) => ({ userId: req.user!.id, ip: req.ip ?? null });
const admin = [authenticate, authorize('ADMIN')];
const student = [authenticate, authorize('STUDENT')];

/** /job-roles — Admin defines roles as required competency codes and levels (BRQ-C.3). */
export function jobRoleRoutes(): Router {
  const router = Router();
  router.get(
    '/',
    ...admin,
    asyncHandler(async (_req, res) => {
      res.json(await service.listRoles());
    }),
  );
  router.post(
    '/',
    ...admin,
    validate({ body: JobRoleSchema }),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createRole(actor(req), req.body as JobRoleInput));
    }),
  );
  router.put(
    '/:id',
    ...admin,
    validate({ params: id, body: JobRoleSchema }),
    asyncHandler(async (req, res) => {
      res.json(await service.updateRole(actor(req), req.params.id!, req.body as JobRoleInput));
    }),
  );
  return router;
}

/** /opportunities — Admin publishes them (BRQ-13.1); students mark interest (BRQ-13.4). */
export function opportunityRoutes(): Router {
  const router = Router();
  router.get(
    '/',
    ...admin,
    validate({ query: OpportunityListQuerySchema }),
    asyncHandler(async (req, res) => {
      res.json(await service.listOpportunities(req.query as unknown as OpportunityListQuery));
    }),
  );
  router.post(
    '/',
    ...admin,
    validate({ body: OpportunitySchema }),
    asyncHandler(async (req, res) => {
      res
        .status(201)
        .json(await service.createOpportunity(actor(req), req.body as OpportunityInput));
    }),
  );
  router.put(
    '/:id',
    ...admin,
    validate({ params: id, body: OpportunitySchema }),
    asyncHandler(async (req, res) => {
      res.json(
        await service.updateOpportunity(actor(req), req.params.id!, req.body as OpportunityInput),
      );
    }),
  );
  router.get(
    '/:id/interested',
    ...admin,
    validate({ params: id }),
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.interested(req.params.id!));
    }),
  );
  router.get(
    '/:id/interested.csv',
    ...admin,
    validate({ params: id }),
    asyncHandler(async (req, res) => {
      const { body, filename } = await service.interestedCsv(req.params.id!);
      res
        .set({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        })
        .send(body);
    }),
  );
  router.post(
    '/:id/interest',
    ...student,
    validate({ params: id }),
    asyncHandler(async (req, res) => {
      res.json(await service.markInterest(actor(req), req.user!.studentId!, req.params.id!));
    }),
  );
  router.delete(
    '/:id/interest',
    ...student,
    validate({ params: id }),
    asyncHandler(async (req, res) => {
      res.json(await service.withdrawInterest(actor(req), req.user!.studentId!, req.params.id!));
    }),
  );
  return router;
}

/** /students/me/matches — the student's ranked opportunities (BR-22, BRQ-13.2, 13.3). */
export function studentMatchRoutes(): Router {
  const router = Router();
  router.get(
    '/me/matches',
    ...student,
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.matches(req.user!.studentId!));
    }),
  );
  return router;
}
