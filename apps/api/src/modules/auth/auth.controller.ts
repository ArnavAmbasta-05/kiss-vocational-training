import type { CookieOptions, Response } from 'express';
import type { LoginInput } from '@vtmp/shared';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH, REFRESH_TOKEN_TTL_MS } from '../../core/auth';
import { config } from '../../core/config';
import { asyncHandler } from '../../core/http';
import * as authService from './auth.service';

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    // Browsers drop Secure cookies on plain http://localhost, so only require it in production.
    secure: config().NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  };
}

function sendSession(res: Response, issued: authService.IssuedSession) {
  res
    .cookie(REFRESH_COOKIE, issued.refreshToken, {
      ...cookieOptions(),
      maxAge: REFRESH_TOKEN_TTL_MS,
    })
    .set('Cache-Control', 'no-store')
    .json(issued.session);
}

function refreshCookie(req: { cookies?: Record<string, string | undefined> }) {
  return req.cookies?.[REFRESH_COOKIE];
}

export const login = asyncHandler(async (req, res) => {
  sendSession(res, await authService.login(req.body as LoginInput, req.ip));
});

export const refresh = asyncHandler(async (req, res) => {
  try {
    sendSession(res, await authService.refresh(refreshCookie(req)));
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    throw err;
  }
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(refreshCookie(req));
  res.clearCookie(REFRESH_COOKIE, cookieOptions()).status(204).end();
});

export const me = asyncHandler(async (req, res) => {
  res.json(await authService.getMe(req.user!.id));
});

export { refreshCookie };
