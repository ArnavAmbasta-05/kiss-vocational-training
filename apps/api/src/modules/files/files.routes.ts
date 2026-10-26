import express, { Router } from 'express';
import { config } from '../../core/config';
import { AppError } from '../../core/errors';
import { asyncHandler } from '../../core/http';
import { storage, verifyLocalGrant } from '../../core/storage';

/** The database caps evidence at 10 MB; anything larger is refused before it is read. */
const HARD_LIMIT = 10 * 1024 * 1024;

/**
 * /files/:token — the local storage driver's stand-in for signed upload and download URLs, so
 * development and tests behave like production without Vercel Blob. The token is the
 * capability (HMAC-signed key, operation, type, size and expiry); there is no session. With the
 * Vercel Blob driver this router answers 404: the browser talks to the store directly.
 */
export function fileRoutes(): Router {
  const router = Router();
  const localOnly: express.RequestHandler = (_req, _res, next) =>
    next(config().STORAGE_DRIVER === 'local' ? undefined : AppError.notFound());

  router.put(
    '/:token',
    localOnly,
    express.raw({ type: () => true, limit: HARD_LIMIT }),
    asyncHandler(async (req, res) => {
      const grant = verifyLocalGrant(String(req.params.token));
      if (!grant || grant.op !== 'put') throw AppError.forbidden('Upload link invalid or expired');
      const type = (req.get('content-type') ?? '').split(';')[0]!.trim();
      if (type !== grant.contentType) {
        throw AppError.unprocessable('UNSUPPORTED_TYPE', 'The file type does not match the upload');
      }
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (body.length === 0 || body.length > (grant.maxBytes ?? 0)) {
        throw AppError.unprocessable('FILE_TOO_LARGE', 'The file is empty or too large');
      }
      if (await storage().stat(grant.key)) {
        throw AppError.conflict('ALREADY_UPLOADED', 'This upload link was already used');
      }
      await storage().put(grant.key, body, type);
      res.status(201).json({ key: grant.key });
    }),
  );

  router.get(
    '/:token',
    localOnly,
    asyncHandler(async (req, res) => {
      const grant = verifyLocalGrant(String(req.params.token));
      if (!grant || grant.op !== 'get') throw AppError.forbidden('Link invalid or expired');
      const [info, body] = await Promise.all([storage().stat(grant.key), storage().get(grant.key)]);
      if (!info || !body) throw AppError.notFound('File not found');
      res
        .set({
          'Content-Type': info.contentType,
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, no-store',
        })
        .send(body);
    }),
  );
  return router;
}
