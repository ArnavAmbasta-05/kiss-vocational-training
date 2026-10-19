import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { RoleSchema, type Role } from '@vtmp/shared';
import { config } from '../config';
import { AppError } from '../errors';

/** ADR-05: short-lived access token in memory, long-lived refresh token in an httpOnly cookie. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_COOKIE = 'vtmp_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

const ISSUER = 'kiss-vtmp';
const AUDIENCE = 'kiss-vtmp-web';

export interface AccessClaims {
  sub: string;
  role: Role;
}

export function signAccessToken(user: { id: string; role: Role }): {
  token: string;
  expiresIn: number;
} {
  const token = jwt.sign({ role: user.role }, config().JWT_SECRET, {
    algorithm: 'HS256',
    subject: user.id,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
  return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const payload = jwt.verify(token, config().JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload === 'string' || !payload.sub) throw new Error('bad payload');
    return { sub: payload.sub, role: RoleSchema.parse(payload.role) };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Your session has expired');
    }
    throw new AppError(401, 'INVALID_TOKEN', 'Invalid access token');
  }
}

/** 32 random bytes, base64url. Only the HMAC is stored, keyed with REFRESH_SECRET. */
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashRefreshToken(raw) };
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(`${config().REFRESH_SECRET}:${raw}`).digest('hex');
}
