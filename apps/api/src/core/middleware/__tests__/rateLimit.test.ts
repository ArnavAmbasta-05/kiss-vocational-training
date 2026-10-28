import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../../auth/tokens';
import { globalRateKey, globalRateLimiter } from '../rateLimit';

/** A tiny app behind the global limiter only, with a limit small enough to reach. */
function appWithLimit(limit: number) {
  const app = express();
  app.use(globalRateLimiter(limit));
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  return app;
}

const bearer = (id: string) => ({
  Authorization: `Bearer ${signAccessToken({ id, role: 'STUDENT' }).token}`,
});

describe('global rate limit', () => {
  it('counts signed-in users one by one, so a class behind one address is not locked out', async () => {
    const app = appWithLimit(3);
    for (let i = 0; i < 3; i++) {
      expect((await request(app).get('/ping').set(bearer('student-a'))).status).toBe(200);
    }
    expect((await request(app).get('/ping').set(bearer('student-a'))).status).toBe(429);
    // Same address, another student: their own allowance.
    expect((await request(app).get('/ping').set(bearer('student-b'))).status).toBe(200);
  });

  it('counts anonymous and made-up tokens against the address', async () => {
    const app = appWithLimit(2);
    expect((await request(app).get('/ping')).status).toBe(200);
    expect((await request(app).get('/ping').set({ Authorization: 'Bearer forged' })).status).toBe(
      200,
    );
    expect((await request(app).get('/ping').set({ Authorization: 'Bearer other' })).status).toBe(
      429,
    );
  });

  it('keys by verified user id, else by address', () => {
    const req = (authorization?: string) =>
      ({ headers: authorization ? { authorization } : {}, ip: '10.0.0.7' }) as never;
    expect(globalRateKey(req(bearer('u1').Authorization))).toBe('user:u1');
    expect(globalRateKey(req('Bearer not-a-jwt'))).toBe('ip:10.0.0.7');
    expect(globalRateKey(req())).toBe('ip:10.0.0.7');
  });
});
