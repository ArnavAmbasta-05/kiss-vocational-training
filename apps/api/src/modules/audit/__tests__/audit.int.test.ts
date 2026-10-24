import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../../app';
import { withAudit } from '../../../core/audit';
import { disconnectPrisma, prisma } from '../../../core/db';
import { createLoginUser, uid } from '../../../../test/fixtures';
import { bearer, login } from '../../../../test/http';

const app = createApp();
afterAll(() => disconnectPrisma());
const auth = async (email: string) => bearer((await login(app, email)).accessToken);

describe('audit log viewer (F19, BRQ-19.2, 19.3)', () => {
  it('admin filters by entity, record, user and date; newest first; system rows have no user', async () => {
    const admin = await createLoginUser(prisma(), Role.ADMIN);
    const A = await auth(admin.email);
    const entityId = `test-${uid()}`;
    await withAudit({ userId: admin.id }, (_tx, log) =>
      log({ action: 'TEST_CREATED', entity: 'TestThing', entityId, newValue: { n: 1 } }),
    );
    await withAudit({ userId: null }, (_tx, log) =>
      log({
        action: 'TEST_UPDATED',
        entity: 'TestThing',
        entityId,
        oldValue: { n: 1 },
        newValue: { n: 2 },
      }),
    );

    const res = await request(app)
      .get(`/api/v1/audit-logs?entity=TestThing&entityId=${entityId}`)
      .set(A)
      .expect(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.map((r: { action: string }) => r.action)).toEqual([
      'TEST_UPDATED',
      'TEST_CREATED',
    ]);
    expect(res.body.data[0]).toMatchObject({ user: null, oldValue: { n: 1 }, newValue: { n: 2 } });
    expect(res.body.data[1].user).toEqual({
      id: admin.id,
      fullName: admin.fullName,
      email: admin.email,
    });

    const byUser = await request(app)
      .get(`/api/v1/audit-logs?userId=${admin.id}&entityId=${entityId}`)
      .set(A)
      .expect(200);
    expect(byUser.body.meta.total).toBe(1);

    const today = new Date().toISOString().slice(0, 10);
    const inRange = await request(app)
      .get(`/api/v1/audit-logs?entityId=${entityId}&from=${today}&to=${today}`)
      .set(A)
      .expect(200);
    expect(inRange.body.meta.total).toBe(2);
    const before = await request(app)
      .get(`/api/v1/audit-logs?entityId=${entityId}&to=2020-01-01`)
      .set(A)
      .expect(200);
    expect(before.body.meta.total).toBe(0);

    const facets = await request(app).get('/api/v1/audit-logs/facets').set(A).expect(200);
    expect(facets.body.entities).toContain('TestThing');
    expect(facets.body.actions).toEqual(expect.arrayContaining(['TEST_CREATED', 'TEST_UPDATED']));

    const csv = await request(app)
      .get(`/api/v1/audit-logs/export.csv?entityId=${entityId}`)
      .set(A)
      .expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['x-export-truncated']).toBe('false');
    const lines = csv.text.replace(String.fromCharCode(0xfeff), '').trim().split('\r\n');
    expect(lines[0]).toBe('Time (UTC),User,Email,Action,Entity,Entity ID,Old value,New value,IP');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('System');
  });

  it('only admins may read it; there is no way to edit or delete through the API', async () => {
    const trainer = await createLoginUser(prisma(), Role.TRAINER);
    const T = await auth(trainer.email);
    await request(app).get('/api/v1/audit-logs').set(T).expect(403);
    await request(app).get('/api/v1/audit-logs/export.csv').set(T).expect(403);
    await request(app).get('/api/v1/audit-logs').expect(401);

    const admin = await createLoginUser(prisma(), Role.ADMIN);
    const A = await auth(admin.email);
    const [row] = (await request(app).get('/api/v1/audit-logs?pageSize=1').set(A).expect(200)).body
      .data;
    await request(app).put(`/api/v1/audit-logs/${row.id}`).set(A).send({}).expect(404);
    await request(app).delete(`/api/v1/audit-logs/${row.id}`).set(A).expect(404);
    // TC-19: the table itself refuses UPDATE (the trigger is tested in core/db too).
    await expect(
      prisma().$executeRaw`UPDATE audit_logs SET action = 'TAMPERED' WHERE id = ${row.id}::uuid`,
    ).rejects.toThrow(/insert-only/);
  });

  it('validates filters', async () => {
    const admin = await createLoginUser(prisma(), Role.ADMIN);
    const A = await auth(admin.email);
    const res = await request(app).get('/api/v1/audit-logs?from=24-10-2026').set(A);
    expect(res.status).toBe(422);
  });
});
