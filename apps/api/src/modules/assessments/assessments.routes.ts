import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  AssessmentCreateSchema,
  AssessmentUpdateSchema,
  EvaluationSaveSchema,
  ProgressCreateSchema,
  ResultsSaveSchema,
  type AssessmentCreateInput,
  type AssessmentUpdateInput,
  type EvaluationSaveInput,
  type ProgressCreateInput,
  type ResultsSaveInput,
} from '@vtmp/shared';
import { authenticate, authorize, owns, requireOwnership } from '../../core/auth';
import { asyncHandler } from '../../core/http';
import { validate } from '../../core/middleware';
import * as service from './assessments.service';

const uuid = z.string().uuid();
const BatchParams = z.object({ batchId: uuid });
const AssessmentParams = z.object({ assessmentId: uuid });
const EnrollmentParams = z.object({ enrollmentId: uuid });

const viewer = (req: Request) => ({
  userId: req.user!.id,
  role: req.user!.role,
  trainerId: req.user!.trainerId,
  ip: req.ip ?? null,
});
const staff = [authenticate, authorize('TRAINER', 'ADMIN')];

/** /batches/:batchId/{assessments,progress,evaluations} — trainer of the batch or admin. */
export function batchAssessmentRoutes(): Router {
  const router = Router();
  const own = requireOwnership(owns.batch());
  router.get(
    '/:batchId/assessments',
    ...staff,
    own,
    validate({ params: BatchParams }),
    asyncHandler(async (req, res) => {
      res.json(await service.list(req.params.batchId!));
    }),
  );
  router.post(
    '/:batchId/assessments',
    ...staff,
    own,
    validate({ params: BatchParams, body: AssessmentCreateSchema }),
    asyncHandler(async (req, res) => {
      res
        .status(201)
        .json(
          await service.create(viewer(req), req.params.batchId!, req.body as AssessmentCreateInput),
        );
    }),
  );
  router.get(
    '/:batchId/progress',
    ...staff,
    own,
    validate({ params: BatchParams }),
    asyncHandler(async (req, res) => {
      res.json(await service.progress(req.params.batchId!));
    }),
  );
  router.post(
    '/:batchId/progress',
    ...staff,
    own,
    validate({ params: BatchParams, body: ProgressCreateSchema }),
    asyncHandler(async (req, res) => {
      res
        .status(201)
        .json(
          await service.addProgress(
            viewer(req),
            req.params.batchId!,
            req.body as ProgressCreateInput,
          ),
        );
    }),
  );
  router.get(
    '/:batchId/evaluations',
    ...staff,
    own,
    validate({ params: BatchParams }),
    asyncHandler(async (req, res) => {
      res.json(await service.evaluations(req.params.batchId!));
    }),
  );
  return router;
}

/** /assessments/:assessmentId — edit, delete, marks (BRQ-6.1, 6.2). */
export function assessmentRoutes(): Router {
  const router = Router();
  router.use(...staff);
  const own = requireOwnership(owns.assessment());
  router.patch(
    '/:assessmentId',
    own,
    validate({ params: AssessmentParams, body: AssessmentUpdateSchema }),
    asyncHandler(async (req, res) => {
      res.json(
        await service.update(
          viewer(req),
          req.params.assessmentId!,
          req.body as AssessmentUpdateInput,
        ),
      );
    }),
  );
  router.delete(
    '/:assessmentId',
    own,
    validate({ params: AssessmentParams }),
    asyncHandler(async (req, res) => {
      await service.remove(viewer(req), req.params.assessmentId!);
      res.status(204).end();
    }),
  );
  router.get(
    '/:assessmentId/results',
    own,
    validate({ params: AssessmentParams }),
    asyncHandler(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await service.resultsSheet(req.params.assessmentId!));
    }),
  );
  router.put(
    '/:assessmentId/results',
    own,
    validate({ params: AssessmentParams, body: ResultsSaveSchema }),
    asyncHandler(async (req, res) => {
      res.json(
        await service.saveResults(
          viewer(req),
          req.params.assessmentId!,
          req.body as ResultsSaveInput,
        ),
      );
    }),
  );
  return router;
}

/** /enrollments/:enrollmentId/evaluation — mounted before the student-only enrollments router. */
export function evaluationRoutes(): Router {
  const router = Router();
  const own = requireOwnership(owns.enrollment());
  router.get(
    '/:enrollmentId/evaluation',
    ...staff,
    own,
    validate({ params: EnrollmentParams }),
    asyncHandler(async (req, res) => {
      res.json(await service.evaluationFor(req.params.enrollmentId!));
    }),
  );
  router.put(
    '/:enrollmentId/evaluation',
    ...staff,
    own,
    validate({ params: EnrollmentParams, body: EvaluationSaveSchema }),
    asyncHandler(async (req, res) => {
      res.json(
        await service.saveEvaluation(
          viewer(req),
          req.params.enrollmentId!,
          req.body as EvaluationSaveInput,
        ),
      );
    }),
  );
  return router;
}
