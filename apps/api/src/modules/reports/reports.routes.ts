import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ReportFormatQuerySchema, StudentReportQuerySchema, type ReportFormat } from '@vtmp/shared';
import { authenticate, authorize, owns, requireOwnership } from '../../core/auth';
import { asyncHandler } from '../../core/http';
import { validate } from '../../core/middleware';
import * as service from './reports.service';

const uuid = z.string().uuid();

function send(res: Response, file: service.ReportFile) {
  res
    .set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'private, no-store',
    })
    .send(file.body);
}

const format = (req: Request) => (req.query as { format: ReportFormat }).format;

/** /reports — BRQ-8.1 (student PDF), BRQ-8.2 (batch and course, CSV or PDF). */
export function reportRoutes(): Router {
  const router = Router();
  router.get(
    '/students/:studentId.pdf',
    authenticate,
    requireOwnership(owns.studentSelf()),
    validate({ query: StudentReportQuerySchema }),
    asyncHandler(async (req, res) => {
      const id = req.params.studentId === 'me' ? req.user!.studentId! : req.params.studentId!;
      const { enrollmentId } = req.query as z.infer<typeof StudentReportQuerySchema>;
      send(
        res,
        await service.studentReport({ userId: req.user!.id, ip: req.ip ?? null }, id, enrollmentId),
      );
    }),
  );
  router.get(
    '/batches/:batchId',
    authenticate,
    authorize('TRAINER', 'ADMIN'),
    requireOwnership(owns.batch()),
    validate({ params: z.object({ batchId: uuid }), query: ReportFormatQuerySchema }),
    asyncHandler(async (req, res) => {
      send(res, await service.batchReport(req.params.batchId!, format(req)));
    }),
  );
  router.get(
    '/courses/:courseId',
    authenticate,
    authorize('ADMIN'),
    validate({ params: z.object({ courseId: uuid }), query: ReportFormatQuerySchema }),
    asyncHandler(async (req, res) => {
      send(res, await service.courseReport(req.params.courseId!, format(req)));
    }),
  );
  return router;
}
