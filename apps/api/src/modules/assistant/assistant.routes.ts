import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  AskSchema,
  MaterialCreateSchema,
  MaterialUploadUrlSchema,
  type AskInput,
  type MaterialCreateInput,
  type MaterialUploadUrlInput,
} from '@vtmp/shared';
import { authenticate, authorize } from '../../core/auth';
import { asyncHandler } from '../../core/http';
import { validate } from '../../core/middleware';
import * as service from './assistant.service';

const actor = (req: Request) => ({ userId: req.user!.id, ip: req.ip ?? null });
const IdParams = z.object({ id: z.string().uuid() });
const ListQuery = z.object({ courseId: z.string().uuid().optional() }).strict();

/**
 * /assistant — the AI Training Assistant (F17). Students ask about their own courses (the
 * course comes from their placements, never from the request); admins see usage.
 */
export function assistantRoutes(): Router {
  const router = Router();
  router.get(
    '/status',
    authenticate,
    authorize('STUDENT'),
    asyncHandler(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await service.status(req.user!.id, req.user!.studentId!));
    }),
  );
  router.post(
    '/ask',
    authenticate,
    authorize('STUDENT'),
    validate({ body: AskSchema }),
    asyncHandler(async (req, res) => {
      const reply = await service.ask(
        { id: req.user!.id, studentId: req.user!.studentId!, locale: req.user!.locale },
        req.body as AskInput,
      );
      res.set('Cache-Control', 'no-store').json(reply);
    }),
  );
  router.get(
    '/usage',
    authenticate,
    authorize('ADMIN'),
    asyncHandler(async (_req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.usage());
    }),
  );
  return router;
}

/** /materials — course materials the assistant answers from (BRQ-17.2), Admin only. */
export function materialRoutes(): Router {
  const router = Router();
  router.use(authenticate, authorize('ADMIN'));
  router.get(
    '/',
    validate({ query: ListQuery }),
    asyncHandler(async (req, res) => {
      const { courseId } = req.query as z.infer<typeof ListQuery>;
      res.set('Cache-Control', 'no-store').json(await service.listMaterials(courseId));
    }),
  );
  router.post(
    '/upload-url',
    validate({ body: MaterialUploadUrlSchema }),
    asyncHandler(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await service.uploadUrl(req.body as MaterialUploadUrlInput));
    }),
  );
  router.post(
    '/',
    validate({ body: MaterialCreateSchema }),
    asyncHandler(async (req, res) => {
      res
        .status(201)
        .json(await service.createMaterial(actor(req), req.body as MaterialCreateInput));
    }),
  );
  router.post(
    '/:id/approve',
    validate({ params: IdParams }),
    asyncHandler(async (req, res) => {
      res.json(await service.approveMaterial(actor(req), String(req.params.id)));
    }),
  );
  router.post(
    '/:id/reject',
    validate({ params: IdParams }),
    asyncHandler(async (req, res) => {
      res.json(await service.rejectMaterial(actor(req), String(req.params.id)));
    }),
  );
  router.delete(
    '/:id',
    validate({ params: IdParams }),
    asyncHandler(async (req, res) => {
      await service.removeMaterial(actor(req), String(req.params.id));
      res.status(204).end();
    }),
  );
  return router;
}
