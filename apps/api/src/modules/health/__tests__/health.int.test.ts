import request from 'supertest';
import { createApp } from '../../../app';
import { disconnectPrisma } from '../../../core/db';

describe('GET /api/v1/health (real database)', () => {
  afterAll(() => disconnectPrisma());

  it('reports the database as ok', async () => {
    const res = await request(createApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
  });
});
