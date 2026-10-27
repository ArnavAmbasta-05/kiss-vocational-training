import type { RequestHandler } from 'express';
import type { Role } from '@vtmp/shared';
import { prisma } from '../db';
import { AppError } from '../errors';
import { verifyAccessToken } from './tokens';

/**
 * Verifies the Bearer access token and loads the user. The DB lookup means deactivation and
 * role changes take effect on the next request rather than when the token expires.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(AppError.unauthorized());

  let claims;
  try {
    claims = verifyAccessToken(header.slice('Bearer '.length).trim());
  } catch (err) {
    return next(err);
  }

  prisma()
    .user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        role: true,
        locale: true,
        isActive: true,
        student: { select: { id: true } },
        trainer: { select: { id: true } },
      },
    })
    .then((user) => {
      if (!user || !user.isActive) throw AppError.unauthorized('Account is not active');
      req.user = {
        id: user.id,
        role: user.role,
        locale: user.locale,
        studentId: user.student?.id ?? null,
        trainerId: user.trainer?.id ?? null,
      };
      next();
    })
    .catch(next);
};

/** Allows only the listed roles (BRQ-1.2). Must run after authenticate. */
export function authorize(...roles: Role[]): RequestHandler & { allowedRoles: Role[] } {
  const handler: RequestHandler = (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };
  // Read by the security suite, which checks every route against its roles.
  return Object.assign(handler, { allowedRoles: roles });
}
