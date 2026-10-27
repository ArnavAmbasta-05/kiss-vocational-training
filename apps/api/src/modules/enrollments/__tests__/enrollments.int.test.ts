import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../../app';
import { disconnectPrisma, prisma } from '../../../core/db';
import { settings } from '../../../core/settings';
import { createLoginUser, createOpenCycle, setWindow } from '../../../../test/fixtures';
import { bearer, login } from '../../../../test/http';

const app = createApp();
afterAll(() => disconnectPrisma());

async function signedIn(role: Role) {
  const user = await createLoginUser(prisma(), role);
  const { accessToken } = await login(app, user.email);
  return { user, auth: bearer(accessToken) };
}

async function apply(auth: Record<string, string>, cycleId: string, courseIds: string[]) {
  return request(app).post('/api/v1/enrollments').set(auth).send({ cycleId, courseIds });
}

describe('student applies (BRQ-3.1, BR-01, BR-02)', () => {
  it('submits ranked preferences, audits it and shows it under /enrollments/me', async () => {
    const { cycle, courses } = await createOpenCycle(prisma());
    const { auth } = await signedIn(Role.STUDENT);

    const res = await apply(auth, cycle.id, [courses[2]!.id, courses[0]!.id]);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'PENDING', editable: true, cycleName: cycle.name });
    expect(res.body.preferences.map((p: { courseId: string }) => p.courseId)).toEqual([
      courses[2]!.id,
      courses[0]!.id,
    ]);
    expect(
      await prisma().auditLog.count({
        where: { action: 'ENROLLMENT_SUBMITTED', entityId: res.body.id },
      }),
    ).toBe(1);

    const mine = await request(app).get('/api/v1/enrollments/me').set(auth);
    expect(mine.status).toBe(200);
    expect(mine.body[0]).toMatchObject({ id: res.body.id, history: [{ status: 'PENDING' }] });
  });

  it.each(['closed', 'off', 'upcoming'] as const)(
    'rejects a course whose window is %s with 409 ENROLLMENT_WINDOW_CLOSED (TC-03)',
    async (state) => {
      const { cycle, courses } = await createOpenCycle(prisma());
      await setWindow(prisma(), cycle.id, courses[1]!.id, state);
      const { auth } = await signedIn(Role.STUDENT);
      const res = await apply(auth, cycle.id, [courses[0]!.id, courses[1]!.id]);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ENROLLMENT_WINDOW_CLOSED');
      expect(await prisma().enrollment.count({ where: { cycleId: cycle.id } })).toBe(0);
    },
  );

  it('rejects a deactivated course and a course not offered in the cycle', async () => {
    const { cycle, courses } = await createOpenCycle(prisma());
    const other = await createOpenCycle(prisma(), 1);
    await prisma().course.update({ where: { id: courses[0]!.id }, data: { isActive: false } });
    const { auth } = await signedIn(Role.STUDENT);
    expect((await apply(auth, cycle.id, [courses[0]!.id])).body.error.code).toBe(
      'ENROLLMENT_WINDOW_CLOSED',
    );
    expect((await apply(auth, cycle.id, [other.courses[0]!.id])).body.error.code).toBe(
      'ENROLLMENT_WINDOW_CLOSED',
    );
  });

  it('rejects a second active application in the same cycle (TC-04, BRQ-3.2)', async () => {
    const { cycle, courses } = await createOpenCycle(prisma());
    const { auth } = await signedIn(Role.STUDENT);
    expect((await apply(auth, cycle.id, [courses[0]!.id])).status).toBe(201);
    const again = await apply(auth, cycle.id, [courses[1]!.id]);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('DUPLICATE_ENROLLMENT');
  });

  it('allows a new application after withdrawing', async () => {
    const { cycle, courses } = await createOpenCycle(prisma());
    const { auth } = await signedIn(Role.STUDENT);
    const first = await apply(auth, cycle.id, [courses[0]!.id]);
    const withdrawn = await request(app)
      .post(`/api/v1/enrollments/${first.body.id}/withdraw`)
      .set(auth);
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.status).toBe('WITHDRAWN');
    expect((await apply(auth, cycle.id, [courses[1]!.id])).status).toBe(201);
  });

  it('validates preferences: duplicates, too many, and the configured limit', async () => {
    const { cycle, courses } = await createOpenCycle(prisma(), 4);
    const { auth } = await signedIn(Role.STUDENT);
    const ids = courses.map((c) => c.id);
    expect((await apply(auth, cycle.id, [ids[0]!, ids[0]!])).status).toBe(422);
    expect((await apply(auth, cycle.id, ids)).status).toBe(422);

    const admin = await createLoginUser(prisma(), Role.ADMIN);
    await settings.set({ userId: admin.id }, 'enrollment.maxPreferences', 2);
    try {
      const res = await apply(auth, cycle.id, ids.slice(0, 3));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('TOO_MANY_PREFERENCES');
    } finally {
      await prisma().setting.deleteMany({ where: { key: 'enrollment.maxPreferences' } });
      settings.invalidate();
    }
  });

  it('only students can apply', async () => {
    const { cycle, courses } = await createOpenCycle(prisma(), 1);
    const { auth } = await signedIn(Role.TRAINER);
    expect((await apply(auth, cycle.id, [courses[0]!.id])).status).toBe(403);
  });
});

describe('student edits a pending application', () => {
  it('changes preferences while the window is open', async () => {
    const { cycle, courses } = await createOpenCycle(prisma());
    const { auth } = await signedIn(Role.STUDENT);
    const e = await apply(auth, cycle.id, [courses[0]!.id]);
    const res = await request(app)
      .put(`/api/v1/enrollments/${e.body.id}`)
      .set(auth)
      .send({ courseIds: [courses[1]!.id, courses[0]!.id] });
    expect(res.status).toBe(200);
    expect(res.body.preferences.map((p: { rank: number }) => p.rank)).toEqual([1, 2]);
    expect(res.body.preferences[0].courseId).toBe(courses[1]!.id);
  });

  it('refuses edits once the window has closed (TC-05, BRQ-3.2)', async () => {
    const { cycle, courses } = await createOpenCycle(prisma());
    const { auth } = await signedIn(Role.STUDENT);
    const e = await apply(auth, cycle.id, [courses[0]!.id]);
    await setWindow(prisma(), cycle.id, courses[0]!.id, 'closed');
    const res = await request(app)
      .put(`/api/v1/enrollments/${e.body.id}`)
      .set(auth)
      .send({ courseIds: [courses[1]!.id] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ENROLLMENT_WINDOW_CLOSED');
    const mine = await request(app).get('/api/v1/enrollments/me').set(auth);
    expect(mine.body[0].editable).toBe(false);
  });

  it("refuses another student's application (403) and unknown ids (404)", async () => {
    const { cycle, courses } = await createOpenCycle(prisma());
    const owner = await signedIn(Role.STUDENT);
    const other = await signedIn(Role.STUDENT);
    const e = await apply(owner.auth, cycle.id, [courses[0]!.id]);
    const path = `/api/v1/enrollments/${e.body.id}`;
    expect(
      (
        await request(app)
          .put(path)
          .set(other.auth)
          .send({ courseIds: [courses[1]!.id] })
      ).status,
    ).toBe(403);
    expect((await request(app).post(`${path}/withdraw`).set(other.auth)).status).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/enrollments/00000000-0000-4000-8000-000000000000/withdraw')
          .set(owner.auth)
      ).status,
    ).toBe(404);
  });
});

describe('admin review (BRQ-3.3, BR-12)', () => {
  async function pending(n: number) {
    const { cycle, courses } = await createOpenCycle(prisma());
    const students = [];
    for (let i = 0; i < n; i++) {
      const s = await signedIn(Role.STUDENT);
      const e = await apply(s.auth, cycle.id, [courses[i % courses.length]!.id]);
      students.push({ ...s, enrollmentId: e.body.id as string });
    }
    return { cycle, courses, students };
  }

  it('approves: status, audit, notification, and the student sees APPROVED at once', async () => {
    const admin = await signedIn(Role.ADMIN);
    const { students } = await pending(1);
    const s = students[0]!;

    const res = await request(app)
      .post(`/api/v1/admin/enrollments/${s.enrollmentId}/approve`)
      .set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'APPROVED', reason: null });

    const mine = await request(app).get('/api/v1/enrollments/me').set(s.auth);
    expect(mine.body[0].status).toBe('APPROVED');
    expect(mine.body[0].history.map((h: { status: string }) => h.status)).toEqual([
      'PENDING',
      'APPROVED',
    ]);

    const audit = await prisma().auditLog.findFirstOrThrow({
      where: { action: 'ENROLLMENT_APPROVED', entityId: s.enrollmentId },
    });
    expect(audit).toMatchObject({
      userId: admin.user.id,
      oldValue: { status: 'PENDING' },
      newValue: { status: 'APPROVED' },
    });

    const inbox = await request(app).get('/api/v1/notifications/me').set(s.auth);
    expect(inbox.body.unreadCount).toBe(1);
    expect(inbox.body.data[0]).toMatchObject({ type: 'ENROLLMENT_APPROVED', readAt: null });
  });

  it('requires a reason to reject and stores it for the student (BRQ-3.4)', async () => {
    const admin = await signedIn(Role.ADMIN);
    const { students } = await pending(1);
    const path = `/api/v1/admin/enrollments/${students[0]!.enrollmentId}/reject`;
    expect((await request(app).post(path).set(admin.auth).send({})).status).toBe(422);
    const res = await request(app)
      .post(path)
      .set(admin.auth)
      .send({ reason: 'Prerequisite (Class 10) not met' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'REJECTED',
      reason: 'Prerequisite (Class 10) not met',
    });
  });

  it('waitlists, then approves; refuses re-approving (409 INVALID_STATUS_TRANSITION)', async () => {
    const admin = await signedIn(Role.ADMIN);
    const { students } = await pending(1);
    const base = `/api/v1/admin/enrollments/${students[0]!.enrollmentId}`;
    expect(
      (await request(app).post(`${base}/waitlist`).set(admin.auth).send({ reason: 'Seats full' }))
        .body.status,
    ).toBe('WAITLISTED');
    expect((await request(app).post(`${base}/approve`).set(admin.auth)).body.status).toBe(
      'APPROVED',
    );
    const again = await request(app).post(`${base}/approve`).set(admin.auth);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('bulk-approves in one transaction', async () => {
    const admin = await signedIn(Role.ADMIN);
    const { students } = await pending(3);
    const ids = students.map((s) => s.enrollmentId);
    const res = await request(app)
      .post('/api/v1/admin/enrollments/bulk')
      .set(admin.auth)
      .send({ ids, action: 'APPROVE' });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(
      await prisma().enrollment.count({ where: { id: { in: ids }, status: 'APPROVED' } }),
    ).toBe(3);
    expect(
      await prisma().notification.count({
        where: { type: 'ENROLLMENT_APPROVED', userId: { in: students.map((s) => s.user.id) } },
      }),
    ).toBe(3);
  });

  it('rolls back the whole bulk action when one id is unknown or not reviewable (TC-05)', async () => {
    const admin = await signedIn(Role.ADMIN);
    const { students } = await pending(3);
    const ids = students.map((s) => s.enrollmentId);

    const unknown = await request(app)
      .post('/api/v1/admin/enrollments/bulk')
      .set(admin.auth)
      .send({ ids: [...ids, '00000000-0000-4000-8000-000000000000'], action: 'APPROVE' });
    expect(unknown.status).toBe(404);

    await request(app).post(`/api/v1/admin/enrollments/${ids[2]}/approve`).set(admin.auth);
    const mixed = await request(app)
      .post('/api/v1/admin/enrollments/bulk')
      .set(admin.auth)
      .send({ ids, action: 'REJECT', reason: 'Cycle cancelled' });
    expect(mixed.status).toBe(409);

    const statuses = await prisma().enrollment.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
    expect(statuses.find((s) => s.id === ids[0])!.status).toBe('PENDING');
    expect(statuses.find((s) => s.id === ids[1])!.status).toBe('PENDING');
    expect(
      await prisma().auditLog.count({
        where: { action: 'ENROLLMENT_REJECTED', entityId: { in: ids } },
      }),
    ).toBe(0);
  });

  it('replays an Idempotency-Key retry instead of acting twice', async () => {
    const admin = await signedIn(Role.ADMIN);
    const { students } = await pending(2);
    const ids = students.map((s) => s.enrollmentId);
    const send = (body: object, key = `bulk-${ids[0]}`) =>
      request(app)
        .post('/api/v1/admin/enrollments/bulk')
        .set(admin.auth)
        .set('Idempotency-Key', key)
        .send(body);

    const first = await send({ ids, action: 'APPROVE' });
    const retry = await send({ ids, action: 'APPROVE' });
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body).toEqual(first.body);
    expect(
      await prisma().auditLog.count({
        where: { action: 'ENROLLMENT_APPROVED', entityId: { in: ids } },
      }),
    ).toBe(2);

    const reused = await send({ ids, action: 'WAITLIST' });
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect((await send({ ids, action: 'APPROVE' }, 'bad key!')).status).toBe(400);
  });

  it('releases the key when the request fails, so a corrected retry can run', async () => {
    const admin = await signedIn(Role.ADMIN);
    const { students } = await pending(1);
    const key = `retry-${students[0]!.enrollmentId}`;
    const path = `/api/v1/admin/enrollments/${students[0]!.enrollmentId}`;
    await request(app).post(`${path}/approve`).set(admin.auth);
    // Fails (already approved) → key not stored.
    const failed = await request(app)
      .post(`${path}/approve`)
      .set(admin.auth)
      .set('Idempotency-Key', key);
    expect(failed.status).toBe(409);
    expect(await prisma().idempotencyKey.count({ where: { key } })).toBe(0);
  });

  it('lists with filters, search and pagination', async () => {
    const admin = await signedIn(Role.ADMIN);
    const { cycle, courses, students } = await pending(3);
    const all = await request(app)
      .get('/api/v1/admin/enrollments')
      .query({ cycleId: cycle.id, pageSize: 2 })
      .set(admin.auth);
    expect(all.status).toBe(200);
    expect(all.body.meta).toMatchObject({ total: 3, totalPages: 2, pageSize: 2 });
    expect(all.body.data[0].student).toHaveProperty('rollNo');

    const byCourse = await request(app)
      .get('/api/v1/admin/enrollments')
      .query({ cycleId: cycle.id, courseId: courses[0]!.id })
      .set(admin.auth);
    expect(byCourse.body.meta.total).toBe(1);

    const rollNo = (
      await prisma().student.findFirstOrThrow({ where: { userId: students[1]!.user.id } })
    ).rollNo;
    const search = await request(app)
      .get('/api/v1/admin/enrollments')
      .query({ cycleId: cycle.id, q: rollNo })
      .set(admin.auth);
    expect(search.body.meta.total).toBe(1);

    const byStatus = await request(app)
      .get('/api/v1/admin/enrollments')
      .query({ cycleId: cycle.id, status: 'APPROVED' })
      .set(admin.auth);
    expect(byStatus.body.meta.total).toBe(0);
  });

  it('is admin-only', async () => {
    const trainer = await signedIn(Role.TRAINER);
    const student = await signedIn(Role.STUDENT);
    for (const auth of [trainer.auth, student.auth]) {
      expect((await request(app).get('/api/v1/admin/enrollments').set(auth)).status).toBe(403);
    }
  });
});

describe('notifications', () => {
  it('marks one and all as read; another user cannot touch them', async () => {
    const admin = await signedIn(Role.ADMIN);
    const { cycle, courses } = await createOpenCycle(prisma(), 1);
    const s = await signedIn(Role.STUDENT);
    const e = await apply(s.auth, cycle.id, [courses[0]!.id]);
    await request(app)
      .post(`/api/v1/admin/enrollments/${e.body.id}/waitlist`)
      .set(admin.auth)
      .send({});
    await request(app).post(`/api/v1/admin/enrollments/${e.body.id}/approve`).set(admin.auth);

    const inbox = await request(app).get('/api/v1/notifications/me').set(s.auth);
    expect(inbox.body.unreadCount).toBe(2);
    const first = inbox.body.data[0].id as string;

    const other = await signedIn(Role.STUDENT);
    expect(
      (await request(app).post(`/api/v1/notifications/${first}/read`).set(other.auth)).status,
    ).toBe(404);

    expect(
      (await request(app).post(`/api/v1/notifications/${first}/read`).set(s.auth)).status,
    ).toBe(204);
    expect((await request(app).get('/api/v1/notifications/me').set(s.auth)).body.unreadCount).toBe(
      1,
    );
    expect(
      (await request(app).post('/api/v1/notifications/me/read-all').set(s.auth)).body.updated,
    ).toBe(1);
    expect(
      (await request(app).get('/api/v1/notifications/me?unreadOnly=true').set(s.auth)).body.data,
    ).toEqual([]);
  });
});
