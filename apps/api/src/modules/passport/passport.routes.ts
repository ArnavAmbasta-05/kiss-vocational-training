import { Router, type Request } from 'express';
import { z } from 'zod';
import { ShareCreateSchema, type ShareCreateInput } from '@vtmp/shared';
import { authenticate, authorize, owns, requireOwnership } from '../../core/auth';
import { asyncHandler } from '../../core/http';
import { validate } from '../../core/middleware';
import * as service from './passport.service';

const actor = (req: Request) => ({ userId: req.user!.id, ip: req.ip ?? null });
const studentIdOf = (req: Request) =>
  req.params.studentId === 'me' ? req.user!.studentId! : req.params.studentId!;
const student = [authenticate, authorize('STUDENT')];

/**
 * /students/me/passport/shares and /students/:studentId/passport(.pdf). The passport itself is
 * for the student ("me"), their trainers and admins (owns.student); shares are the student's.
 */
export function studentPassportRoutes(): Router {
  const router = Router();
  router.get(
    '/me/passport/shares',
    ...student,
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.listShares(req.user!.studentId!));
    }),
  );
  router.post(
    '/me/passport/shares',
    ...student,
    validate({ body: ShareCreateSchema }),
    asyncHandler(async (req, res) => {
      res
        .status(201)
        .set('Cache-Control', 'no-store')
        .json(
          await service.createShare(
            actor(req),
            req.user!.studentId!,
            (req.body as ShareCreateInput).expiresInDays,
          ),
        );
    }),
  );
  router.get(
    '/:studentId/passport',
    authenticate,
    requireOwnership(owns.student()),
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.passport(studentIdOf(req)));
    }),
  );
  router.get(
    '/:studentId/passport.pdf',
    authenticate,
    requireOwnership(owns.student()),
    asyncHandler(async (req, res) => {
      const { pdf, filename } = await service.passportPdf(studentIdOf(req));
      res
        .set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        })
        .send(pdf);
    }),
  );
  return router;
}

/** DELETE /passport/shares/:id — the student revokes one of their links. */
export function shareRoutes(): Router {
  const router = Router();
  router.delete(
    '/shares/:id',
    ...student,
    validate({ params: z.object({ id: z.string().uuid() }) }),
    asyncHandler(async (req, res) => {
      res.json(await service.revokeShare(actor(req), req.user!.studentId!, req.params.id!));
    }),
  );
  return router;
}
