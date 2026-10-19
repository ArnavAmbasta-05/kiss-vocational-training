import request from 'supertest';
import { createApp } from '../../../app';

const queryRaw = jest.fn();
jest.mock('../../../core/db', () => ({
  prisma: () => ({ $queryRaw: queryRaw }),
  disconnectPrisma: jest.fn(),
}));

describe('GET /api/v1/health', () => {
  afterEach(() => queryRaw.mockReset());

  it('returns ok when the database is reachable', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const res = await request(createApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns 503 degraded when the database is down', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'error' });
  });
});
