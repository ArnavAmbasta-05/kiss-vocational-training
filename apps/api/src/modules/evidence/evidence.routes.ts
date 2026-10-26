import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  EvidenceAttachSchema,
  RubricSchema,
  UploadUrlSchema,
  type EvidenceAttachInput,
  type RubricInput,
  type UploadUrlInput,
} from '@vtmp/shared';
import {
  authenticate,
  authorize,
  canAccessBatch,
  owns,
  requireOwnership,
  type OwnershipResult,
  type Resolver,
} from '../../core/auth';
import { asyncHandler } from '../../core/http';
import { validate } from '../../core/middleware';
import * as assessments from '../assessments/assessments.service';
import * as service from './evidence.service';

const uuid = z.string().uuid();
const actor = (req: Request) => ({ userId: req.user!.id, ip: req.ip ?? null });
const staff = [authenticate, authorize('TRAINER', 'ADMIN')];

/** A result: admins, the batch's trainers, and (reading only) the student it belongs to. */
async function canAccessResult(req: Request, resultId: string): Promise<OwnershipResult> {
  if (!uuid.safeParse(resultId).success) return 'not_found';
  const ctx = await assessments.resultContext(resultId);
  if (!ctx) return 'not_found';
  if (req.user!.role === 'STUDENT') {
    return req.user!.studentId === ctx.studentId ? 'allow' : 'forbidden';
  }
  return canAccessBatch(req.user!, ctx.batchId);
}

const resultInBody: Resolver = (req) =>
  canAccessResult(req, String((req.body as { resultId?: unknown })?.resultId ?? ''));
const resultInPath: Resolver = (req) => canAccessResult(req, String(req.params.resultId ?? ''));
const evidenceInPath: Resolver = async (req) => {
  const id = String(req.params.evidenceId ?? '');
  if (!uuid.safeParse(id).success) return 'not_found';
  const resultId = await service.resultOfEvidence(id);
  return resultId ? canAccessResult(req, resultId) : 'not_found';
};

/** /evidence — upload targets and signed links (F18). */
export function evidenceRoutes(): Router {
  const router = Router();
  router.post(
    '/upload-url',
    ...staff,
    requireOwnership(resultInBody),
    validate({ body: UploadUrlSchema }),
    asyncHandler(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await service.uploadUrl(req.body as UploadUrlInput));
    }),
  );
  // The student whose result it is may open it too (their own evidence).
  router.get(
    '/:evidenceId/url',
    authenticate,
    requireOwnership(evidenceInPath),
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.fileUrl(req.params.evidenceId!));
    }),
  );
  return router;
}

/** /results/:resultId/evidence — attach a file or link with rubric scores (BRQ-18.1–18.3). */
export function resultEvidenceRoutes(): Router {
  const router = Router();
  router.post(
    '/:resultId/evidence',
    ...staff,
    requireOwnership(resultInPath),
    validate({ body: EvidenceAttachSchema }),
    asyncHandler(async (req, res) => {
      res
        .status(201)
        .json(
          await service.attach(actor(req), req.params.resultId!, req.body as EvidenceAttachInput),
        );
    }),
  );
  return router;
}

/** /assessments/:assessmentId/rubric and /evidence — for the batch's trainers and admins. */
export function assessmentEvidenceRoutes(): Router {
  const router = Router();
  router.get(
    '/:assessmentId/rubric',
    ...staff,
    requireOwnership(owns.assessment()),
    asyncHandler(async (req, res) => {
      res.json(await service.rubric(req.params.assessmentId!));
    }),
  );
  router.put(
    '/:assessmentId/rubric',
    ...staff,
    requireOwnership(owns.assessment()),
    validate({ body: RubricSchema }),
    asyncHandler(async (req, res) => {
      res.json(
        await service.saveRubric(actor(req), req.params.assessmentId!, req.body as RubricInput),
      );
    }),
  );
  router.get(
    '/:assessmentId/evidence',
    ...staff,
    requireOwnership(owns.assessment()),
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.sheet(req.params.assessmentId!));
    }),
  );
  return router;
}
