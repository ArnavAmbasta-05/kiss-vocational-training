import request, { type Response } from 'supertest';
import type { Express } from 'express';
import { TEST_PASSWORD } from './fixtures';

/** Extracts the raw refresh token from a response's Set-Cookie header. */
export function refreshCookieFrom(res: Response): string | undefined {
  const header = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const match = cookies.map((c) => /^vtmp_rt=([^;]*)/.exec(c)).find(Boolean);
  return match?.[1] || undefined;
}

export function rawSetCookie(res: Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  return (Array.isArray(header) ? header : [header ?? '']).join('\n');
}

export async function login(app: Express, email: string, password = TEST_PASSWORD) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return {
    res,
    accessToken: res.body.accessToken as string,
    refreshToken: refreshCookieFrom(res),
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
export const cookie = (token: string) => ({ Cookie: `vtmp_rt=${token}` });
