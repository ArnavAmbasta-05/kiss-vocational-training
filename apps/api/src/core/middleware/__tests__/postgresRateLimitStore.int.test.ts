import request from 'supertest';
import { createApp } from '../../../app';
import { disconnectPrisma, prisma } from '../../db';
import { PostgresRateLimitStore } from '../postgresRateLimitStore';
import { uid } from '../../../../test/fixtures';

// The config is read lazily on the first createApp() call, so this override still applies.
process.env.RATE_LIMIT_STORE = 'postgres';

afterAll(() => disconnectPrisma());

function store(windowMs = 60_000) {
  const s = new PostgresRateLimitStore(`test-${uid()}`);
  s.init({ windowMs } as never);
  return s;
}

describe('PostgresRateLimitStore', () => {
  it('counts hits per key within the window', async () => {
    const s = store();
    expect((await s.increment('1.2.3.4')).totalHits).toBe(1);
    expect((await s.increment('1.2.3.4')).totalHits).toBe(2);
    expect((await s.increment('5.6.7.8')).totalHits).toBe(1);
  });

  it('starts a new window once the old one has expired', async () => {
    const s = store(50);
    await s.increment('ip');
    await s.increment('ip');
    await new Promise((r) => setTimeout(r, 120));
    expect((await s.increment('ip')).totalHits).toBe(1);
  });

  it('supports decrement and reset', async () => {
    const s = store();
    await s.increment('ip');
    await s.increment('ip');
    await s.decrement('ip');
    expect((await s.increment('ip')).totalHits).toBe(2);
    await s.resetKey('ip');
    expect((await s.increment('ip')).totalHits).toBe(1);
  });

  it('never stores the raw key', async () => {
    const s = store();
    await s.increment('203.0.113.9');
    const rows = await prisma().rateLimit.findMany({ where: { key: { startsWith: s.prefix } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).not.toContain('203.0.113.9');
  });
});

describe('failed-login limit shared across instances (serverless)', () => {
  beforeEach(async () => {
    await prisma().rateLimit.deleteMany({ where: { key: { startsWith: 'login:' } } });
  });

  it('two app instances enforce one combined limit', async () => {
    const a = createApp();
    const b = createApp();
    for (let i = 0; i < 50; i++) {
      await request(i % 2 ? a : b)
        .post('/api/v1/auth/login')
        .send({});
    }
    const res = await request(a).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
