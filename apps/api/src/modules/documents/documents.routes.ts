import { Router } from 'express';
import { z } from 'zod';
import {
  CertificateListQuerySchema,
  RevokeSchema,
  type CertificateListQuery,
  type RevokeInput,
} from '@vtmp/shared';
import { authenticate, authorize, owns, requireOwnership } from '../../core/auth';
import { asyncHandler, parsePagination } from '../../core/http';
import { validate } from '../../core/middleware';
import * as service from './documents.service';

const CertificateParams = z.object({ certificateId: z.string().uuid() });

/** /certificates — the admin register (BRQ-7.3) and PDF download (owner student or admin). */
export function certificateRoutes(): Router {
  const router = Router();
  router.get(
    '/',
    authenticate,
    authorize('ADMIN'),
    validate({ query: CertificateListQuerySchema }),
    asyncHandler(async (req, res) => {
      res.json(
        await service.list(
          req.query as unknown as CertificateListQuery,
          parsePagination(req.query),
        ),
      );
    }),
  );
  router.get(
    '/:certificateId',
    authenticate,
    requireOwnership(owns.certificate()),
    validate({ params: CertificateParams }),
    asyncHandler(async (req, res) => {
      res.json(await service.get(req.params.certificateId!));
    }),
  );
  // BRQ-15.4, BR-19: Admin revokes (with a reason) or reissues (new code, old SUPERSEDED).
  router.post(
    '/:certificateId/revoke',
    authenticate,
    authorize('ADMIN'),
    validate({ params: CertificateParams, body: RevokeSchema }),
    asyncHandler(async (req, res) => {
      res.json(
        await service.revokeCertificate(
          { userId: req.user!.id, ip: req.ip ?? null },
          req.params.certificateId!,
          (req.body as RevokeInput).reason,
        ),
      );
    }),
  );
  router.post(
    '/:certificateId/reissue',
    authenticate,
    authorize('ADMIN'),
    validate({ params: CertificateParams }),
    asyncHandler(async (req, res) => {
      res
        .status(201)
        .json(
          await service.reissueCertificate(
            { userId: req.user!.id, ip: req.ip ?? null },
            req.params.certificateId!,
          ),
        );
    }),
  );
  router.get(
    '/:certificateId/download',
    authenticate,
    requireOwnership(owns.certificate()),
    validate({ params: CertificateParams }),
    asyncHandler(async (req, res) => {
      const { pdf, filename } = await service.download(req.params.certificateId!);
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

/** GET /students/:studentId/certificates — the student's own (or admin). */
export function studentCertificateRoutes(): Router {
  const router = Router();
  router.get(
    '/:studentId/certificates',
    authenticate,
    requireOwnership(owns.student()),
    asyncHandler(async (req, res) => {
      const id = req.params.studentId === 'me' ? req.user!.studentId! : req.params.studentId!;
      res.set('Cache-Control', 'no-store').json(await service.forStudent(id));
    }),
  );
  return router;
}
