import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  CompetencyInputSchema,
  RatingsSaveSchema,
  ResourceInputSchema,
  type CompetencyInput,
  type RatingsSaveInput,
  type ResourceInput,
} from '@vtmp/shared';
import { authenticate, authorize, owns, requireOwnership } from '../../core/auth';
import { asyncHandler } from '../../core/http';
import { validate } from '../../core/middleware';
import * as service from './competency.service';

const uuid = z.string().uuid();
const CourseParams = z.object({ courseId: uuid });
const IdParams = z.object({ id: uuid });
const BatchParams = z.object({ batchId: uuid });
const GapQuery = z.object({ batchId: uuid.optional() });

const viewer = (req: Request) => ({
  userId: req.user!.id,
  role: req.user!.role,
  ip: req.ip ?? null,
});
const staff = [authenticate, authorize('TRAINER', 'ADMIN')];
const admin = [authenticate, authorize('ADMIN')];

/** /courses/:courseId/{competencies,linkable-assessments,resources} (BRQ-C.1, 12.3). */
export function courseCompetencyRoutes(): Router {
  const router = Router();
  router.get(
    '/:courseId/competencies',
    ...staff,
    validate({ params: CourseParams }),
    asyncHandler(async (req, res) => {
      res.json(await service.listCompetencies(req.params.courseId!));
    }),
  );
  router.post(
    '/:courseId/competencies',
    ...admin,
    validate({ params: CourseParams, body: CompetencyInputSchema }),
    asyncHandler(async (req, res) => {
      res
        .status(201)
        .json(
          await service.createCompetency(
            viewer(req),
            req.params.courseId!,
            req.body as CompetencyInput,
          ),
        );
    }),
  );
  router.get(
    '/:courseId/linkable-assessments',
    ...admin,
    validate({ params: CourseParams }),
    asyncHandler(async (req, res) => {
      res.json(await service.linkableAssessments(req.params.courseId!));
    }),
  );
  router.get(
    '/:courseId/resources',
    ...staff,
    validate({ params: CourseParams }),
    asyncHandler(async (req, res) => {
      res.json(await service.listResources(req.params.courseId!));
    }),
  );
  return router;
}

/** /competencies/:id — Admin edits and deletes. */
export function competencyRoutes(): Router {
  const router = Router();
  router.put(
    '/:id',
    ...admin,
    validate({ params: IdParams, body: CompetencyInputSchema }),
    asyncHandler(async (req, res) => {
      res.json(
        await service.updateCompetency(viewer(req), req.params.id!, req.body as CompetencyInput),
      );
    }),
  );
  router.delete(
    '/:id',
    ...admin,
    validate({ params: IdParams }),
    asyncHandler(async (req, res) => {
      await service.deleteCompetency(viewer(req), req.params.id!);
      res.status(204).end();
    }),
  );
  return router;
}

/** /resources — trainers and admins curate; only admins approve. */
export function resourceRoutes(): Router {
  const router = Router();
  router.post(
    '/',
    ...staff,
    validate({ body: ResourceInputSchema }),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createResource(viewer(req), req.body as ResourceInput));
    }),
  );
  router.put(
    '/:id',
    ...staff,
    validate({ params: IdParams, body: ResourceInputSchema }),
    asyncHandler(async (req, res) => {
      res.json(
        await service.updateResource(viewer(req), req.params.id!, req.body as ResourceInput),
      );
    }),
  );
  router.delete(
    '/:id',
    ...staff,
    validate({ params: IdParams }),
    asyncHandler(async (req, res) => {
      await service.deleteResource(viewer(req), req.params.id!);
      res.status(204).end();
    }),
  );
  router.post(
    '/:id/approve',
    ...admin,
    validate({ params: IdParams }),
    asyncHandler(async (req, res) => {
      res.json(await service.approveResource(viewer(req), req.params.id!));
    }),
  );
  return router;
}

/** /batches/:batchId/{competency-ratings,competency-heatmap} (BRQ-C.2, 12.4). */
export function batchCompetencyRoutes(): Router {
  const router = Router();
  const own = requireOwnership(owns.batch());
  router.get(
    '/:batchId/competency-ratings',
    ...staff,
    own,
    validate({ params: BatchParams }),
    asyncHandler(async (req, res) => {
      res.json(await service.ratingGrid(viewer(req), req.params.batchId!));
    }),
  );
  // BR-13: only an assigned trainer rates and confirms (owns.batch limits trainers to their own).
  router.put(
    '/:batchId/competency-ratings',
    authenticate,
    authorize('TRAINER'),
    own,
    validate({ params: BatchParams, body: RatingsSaveSchema }),
    asyncHandler(async (req, res) => {
      res.json(
        await service.saveRatings(viewer(req), req.params.batchId!, req.body as RatingsSaveInput),
      );
    }),
  );
  router.get(
    '/:batchId/competency-heatmap',
    ...staff,
    own,
    validate({ params: BatchParams }),
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.heatmap(req.params.batchId!));
    }),
  );
  return router;
}

/** /students/:studentId/gaps — the student ("me"), their trainers, or admins (BRQ-12.1–12.3). */
export function studentGapRoutes(): Router {
  const router = Router();
  router.get(
    '/:studentId/gaps',
    authenticate,
    requireOwnership(owns.student()),
    validate({ query: GapQuery }),
    asyncHandler(async (req, res) => {
      const id = req.params.studentId === 'me' ? req.user!.studentId! : req.params.studentId!;
      const { batchId } = req.query as z.infer<typeof GapQuery>;
      res.set('Cache-Control', 'no-store').json(await service.studentGaps(id, batchId));
    }),
  );
  return router;
}
