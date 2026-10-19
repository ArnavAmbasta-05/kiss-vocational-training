import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../../app';
import { disconnectPrisma, prisma } from '../../../core/db';
import { createLoginUser, TEST_PASSWORD, uid } from '../../../../test/fixtures';
import { bearer, cookie, login } from '../../../../test/http';

// Fresh app per test: each has its own in-memory rate-limit store.
let app = createApp();
beforeEach(() => {
  app = createApp();
});
afterAll(() => disconnectPrisma());

async function signedIn(role: Role) {
  const user = await createLoginUser(prisma(), role);
  const session = await login(app, user.email);
  return { user, ...session };
}

describe('role-based access to /admin/users (TC-15)', () => {
  it('returns 401 without a token', async () => {
    expect((await request(app).get('/api/v1/admin/users')).status).toBe(401);
  });

  it.each([Role.STUDENT, Role.TRAINER])('returns 403 for a %s', async (role) => {
    const { accessToken } = await signedIn(role);
    const res = await request(app).get('/api/v1/admin/users').set(bearer(accessToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 for a student trying to create an admin', async () => {
    const { accessToken } = await signedIn(Role.STUDENT);
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set(bearer(accessToken))
      .send({
        role: 'ADMIN',
        email: `x-${uid()}@test.local`,
        fullName: 'Evil',
        password: 'Password1!',
      });
    expect(res.status).toBe(403);
  });
});

describe('admin user management', () => {
  it('lists with search and pagination meta', async () => {
    const { accessToken } = await signedIn(Role.ADMIN);
    const target = await createLoginUser(prisma(), Role.STUDENT);
    const res = await request(app)
      .get('/api/v1/admin/users')
      .query({ q: target.student!.rollNo, pageSize: 5 })
      .set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 5, total: 1 });
    expect(res.body.data[0]).toMatchObject({ id: target.id, rollNo: target.student!.rollNo });
    expect(res.body.data[0]).not.toHaveProperty('passwordHash');
  });

  it('rejects pageSize above 100', async () => {
    const { accessToken } = await signedIn(Role.ADMIN);
    const res = await request(app).get('/api/v1/admin/users?pageSize=101').set(bearer(accessToken));
    expect(res.status).toBe(422);
  });

  it('creates a student who can then sign in, and audits it without the password', async () => {
    const { accessToken } = await signedIn(Role.ADMIN);
    const s = uid();
    const body = {
      role: 'STUDENT',
      email: `new-${s}@test.local`,
      fullName: 'New Student',
      password: 'Initial-Pass-9',
      rollNo: `R-${s}`,
      cgpa: 7.25,
    };
    const res = await request(app).post('/api/v1/admin/users').set(bearer(accessToken)).send(body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ role: 'STUDENT', rollNo: `R-${s}`, isActive: true });

    expect((await login(app, body.email, body.password)).res.status).toBe(200);
    const audit = await prisma().auditLog.findFirstOrThrow({
      where: { action: 'USER_CREATED', entityId: res.body.id },
    });
    expect(JSON.stringify(audit.newValue)).not.toContain('Initial-Pass-9');
  });

  it('requires role-specific fields', async () => {
    const { accessToken } = await signedIn(Role.ADMIN);
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set(bearer(accessToken))
      .send({
        role: 'TRAINER',
        email: `t-${uid()}@test.local`,
        fullName: 'No Code',
        password: 'Password-123',
      });
    expect(res.status).toBe(422);
  });

  it('returns 409 for a duplicate email or roll number', async () => {
    const { accessToken } = await signedIn(Role.ADMIN);
    const existing = await createLoginUser(prisma(), Role.STUDENT);
    const base = { role: 'STUDENT', fullName: 'Dup', password: 'Password-123', cgpa: 6 };

    const dupEmail = await request(app)
      .post('/api/v1/admin/users')
      .set(bearer(accessToken))
      .send({ ...base, email: existing.email, rollNo: `R-${uid()}` });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.error.code).toBe('EMAIL_TAKEN');

    const dupRoll = await request(app)
      .post('/api/v1/admin/users')
      .set(bearer(accessToken))
      .send({ ...base, email: `d-${uid()}@test.local`, rollNo: existing.student!.rollNo });
    expect(dupRoll.status).toBe(409);
    expect(dupRoll.body.error.code).toBe('ROLL_NO_TAKEN');
  });

  it('deactivates a user: sessions revoked, login refused, change audited', async () => {
    const admin = await signedIn(Role.ADMIN);
    const victim = await signedIn(Role.TRAINER);

    const res = await request(app)
      .patch(`/api/v1/admin/users/${victim.user.id}`)
      .set(bearer(admin.accessToken))
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);

    expect(
      (await request(app).post('/api/v1/auth/refresh').set(cookie(victim.refreshToken!))).status,
    ).toBe(401);
    expect((await login(app, victim.user.email)).res.status).toBe(401);
    expect(
      await prisma().auditLog.count({
        where: { action: 'USER_DEACTIVATED', entityId: victim.user.id },
      }),
    ).toBe(1);

    const back = await request(app)
      .patch(`/api/v1/admin/users/${victim.user.id}`)
      .set(bearer(admin.accessToken))
      .send({ isActive: true });
    expect(back.status).toBe(200);
    expect((await login(app, victim.user.email)).res.status).toBe(200);
  });

  it('does not let an admin deactivate themselves', async () => {
    const admin = await signedIn(Role.ADMIN);
    const res = await request(app)
      .patch(`/api/v1/admin/users/${admin.user.id}`)
      .set(bearer(admin.accessToken))
      .send({ isActive: false });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANNOT_DEACTIVATE_SELF');
  });

  it('returns 404 for an unknown user', async () => {
    const admin = await signedIn(Role.ADMIN);
    const res = await request(app)
      .patch('/api/v1/admin/users/00000000-0000-4000-8000-000000000000')
      .set(bearer(admin.accessToken))
      .send({ fullName: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /users/me (BRQ-1.3)', () => {
  it('updates name, locale and phone', async () => {
    const { accessToken, user } = await signedIn(Role.STUDENT);
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set(bearer(accessToken))
      .send({ fullName: 'Renamed Student', locale: 'or', phone: '9437000000' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fullName: 'Renamed Student',
      locale: 'or',
      student: { phone: '9437000000' },
    });
    expect(
      await prisma().auditLog.count({
        where: { action: 'USER_PROFILE_UPDATED', entityId: user.id },
      }),
    ).toBe(1);
  });

  it('refuses attempts to change role or email (privilege escalation)', async () => {
    const { accessToken } = await signedIn(Role.STUDENT);
    for (const body of [{ role: 'ADMIN' }, { email: 'boss@test.local' }]) {
      const res = await request(app).patch('/api/v1/users/me').set(bearer(accessToken)).send(body);
      expect(res.status).toBe(422);
    }
  });
});

describe('POST /users/me/password', () => {
  it('rejects a wrong current password', async () => {
    const { accessToken } = await signedIn(Role.STUDENT);
    const res = await request(app)
      .post('/api/v1/users/me/password')
      .set(bearer(accessToken))
      .send({ currentPassword: 'wrong', newPassword: 'Brand-New-Pass-1' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('rejects passwords shorter than 8 characters', async () => {
    const { accessToken } = await signedIn(Role.STUDENT);
    const res = await request(app)
      .post('/api/v1/users/me/password')
      .set(bearer(accessToken))
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'short' });
    expect(res.status).toBe(422);
  });

  it('changes the password and signs out other sessions only', async () => {
    const user = await createLoginUser(prisma(), Role.STUDENT);
    const here = await login(app, user.email);
    const elsewhere = await login(app, user.email);

    const res = await request(app)
      .post('/api/v1/users/me/password')
      .set(bearer(here.accessToken))
      .set(cookie(here.refreshToken!))
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'Brand-New-Pass-1' });
    expect(res.status).toBe(204);

    expect((await login(app, user.email)).res.status).toBe(401);
    expect((await login(app, user.email, 'Brand-New-Pass-1')).res.status).toBe(200);
    expect(
      (await request(app).post('/api/v1/auth/refresh').set(cookie(here.refreshToken!))).status,
    ).toBe(200);
    expect(
      (await request(app).post('/api/v1/auth/refresh').set(cookie(elsewhere.refreshToken!))).status,
    ).toBe(401);
  });
});
