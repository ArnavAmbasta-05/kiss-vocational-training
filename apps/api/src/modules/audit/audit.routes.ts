import { Router } from 'express';
import { AuditQuerySchema, type AuditQuery } from '@vtmp/shared';
import { authenticate, authorize } from '../../core/auth';
import { asyncHandler } from '../../core/http';
import { validate } from '../../core/middleware';
import * as service from './audit.service';

/**
 * /audit-logs — the read-only audit viewer (F19, BRQ-19.2). Admin only. There are no edit or
 * delete endpoints, and the table itself refuses UPDATE and DELETE (BRQ-19.3).
 */
export function auditLogRoutes(): Router {
  const router = Router();
  router.use(authenticate, authorize('ADMIN'));
  router.get(
    '/',
    validate({ query: AuditQuerySchema }),
    asyncHandler(async (req, res) => {
      res
        .set('Cache-Control', 'no-store')
        .json(await service.list(req.query as unknown as AuditQuery));
    }),
  );
  router.get(
    '/facets',
    asyncHandler(async (_req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.facets());
    }),
  );
  router.get(
    '/export.csv',
    validate({ query: AuditQuerySchema }),
    asyncHandler(async (req, res) => {
      const { body, truncated } = await service.exportCsv(req.query as unknown as AuditQuery);
      const stamp = new Date().toISOString().slice(0, 10);
      res
        .set({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="audit-log-${stamp}.csv"`,
          'Cache-Control': 'private, no-store',
          'X-Export-Truncated': String(truncated),
        })
        .send(body);
    }),
  );
  return router;
}
