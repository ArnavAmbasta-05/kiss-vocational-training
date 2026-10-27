import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../../app';
import { disconnectPrisma, prisma } from '../../../core/db';
import { createLoginUser, createOpenCycle, uid } from '../../../../test/fixtures';
import { bearer, login } from '../../../../test/http';

const app = createApp();
afterAll(() => disconnectPrisma());

async function auth(role: Role) {
  const user = await createLoginUser(prisma(), role);
  return { user, auth: bearer((await login(app, user.email)).accessToken) };
}

describe('admin courses, cycles and windows (BRQ-2.1, 2.3)', () => {
  it('creates, updates and soft-deactivates a course, auditing each change', async () => {
    const admin = await auth(Role.ADMIN);
    const code = `wld-${uid()}`.slice(0, 20);
    const created = await request(app).post('/api/v1/admin/courses').set(admin.auth).send({
      code,
      title: 'Welding Basics',
      description: 'Arc welding fundamentals and safety.',
      durationWeeks: 8,
      prerequisites: null,
      seatCapacity: 20,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ code: code.toUpperCase(), isActive: true });

    const dup = await request(app)
      .post('/api/v1/admin/courses')
      .set(admin.auth)
      .send({ ...created.body, id: undefined, isActive: undefined, code });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('COURSE_CODE_TAKEN');

    const off = await request(app)
      .patch(`/api/v1/admin/courses/${created.body.id}`)
      .set(admin.auth)
      .send({ isActive: false, seatCapacity: 25 });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ isActive: false, seatCapacity: 25 });
    const actions = await prisma().auditLog.findMany({
      where: { entity: 'Course', entityId: created.body.id },
      select: { action: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((a) => a.action)).toEqual(['COURSE_CREATED', 'COURSE_DEACTIVATED']);
  });

  it('creates a cycle and opens a window for a course in it', async () => {
    const admin = await auth(Role.ADMIN);
    const cycle = await request(app)
      .post('/api/v1/admin/cycles')
      .set(admin.auth)
      .send({ name: `Cycle ${uid()}`, startsOn: '2027-06-01', endsOn: '2027-09-30' });
    expect(cycle.status).toBe(201);
    const course = await prisma().course.create({
      data: {
        code: `C-${uid()}`,
        title: 'Plumbing',
        description: 'Pipes and fittings',
        durationWeeks: 6,
        seatCapacity: 15,
      },
    });

    const opens = new Date(Date.now() - 60_000).toISOString();
    const closes = new Date(Date.now() + 86_400_000).toISOString();
    const put = await request(app)
      .put(`/api/v1/admin/cycles/${cycle.body.id}/offerings/${course.id}`)
      .set(admin.auth)
      .send({ enrollmentOpensAt: opens, enrollmentClosesAt: closes, isOpen: true });
    expect(put.status).toBe(200);
    expect(put.body.windowState).toBe('OPEN');

    const toggled = await request(app)
      .put(`/api/v1/admin/cycles/${cycle.body.id}/offerings/${course.id}`)
      .set(admin.auth)
      .send({ enrollmentOpensAt: opens, enrollmentClosesAt: closes, isOpen: false });
    expect(toggled.body.windowState).toBe('CLOSED');

    const bad = await request(app)
      .put(`/api/v1/admin/cycles/${cycle.body.id}/offerings/${course.id}`)
      .set(admin.auth)
      .send({ enrollmentOpensAt: closes, enrollmentClosesAt: opens, isOpen: true });
    expect(bad.status).toBe(422);

    const list = await request(app)
      .get(`/api/v1/admin/cycles/${cycle.body.id}/offerings`)
      .set(admin.auth);
    expect(
      list.body.find((r: { course: { id: string } }) => r.course.id === course.id).offering,
    ).toMatchObject({ isOpen: false });
  });

  it('is admin-only', async () => {
    const student = await auth(Role.STUDENT);
    expect(
      (await request(app).post('/api/v1/admin/courses').set(student.auth).send({})).status,
    ).toBe(403);
    expect((await request(app).get('/api/v1/admin/cycles').set(student.auth)).status).toBe(403);
  });
});

describe('catalogue (BRQ-2.2)', () => {
  it('lets students choose among cycles that offer active courses and have not ended', async () => {
    const db = prisma();
    const { auth: S } = await auth(Role.STUDENT);
    const open = await createOpenCycle(db, 1);
    const ended = await createOpenCycle(db, 1);
    await db.trainingCycle.update({
      where: { id: ended.cycle.id },
      data: { startsOn: new Date('2020-01-06'), endsOn: new Date('2020-04-30') },
    });
    const inactive = await createOpenCycle(db, 1);
    await db.course.update({ where: { id: inactive.courses[0]!.id }, data: { isActive: false } });
    const empty = await db.trainingCycle.create({
      data: {
        name: `Empty ${uid()}`,
        startsOn: new Date('2027-01-04'),
        endsOn: new Date('2027-04-30'),
      },
    });

    const res = await request(app).get('/api/v1/cycles').set(S).expect(200);
    const ids = (res.body as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain(open.cycle.id);
    for (const hidden of [ended.cycle.id, inactive.cycle.id, empty.id]) {
      expect(ids).not.toContain(hidden);
    }
    // The chosen cycle's courses come from ?cycleId=.
    const list = await request(app)
      .get('/api/v1/courses')
      .query({ cycleId: open.cycle.id })
      .set(S)
      .expect(200);
    expect(list.body.cycle.id).toBe(open.cycle.id);
  });

  it('lists active offered courses with window state and indicative seats remaining', async () => {
    const { cycle, courses } = await createOpenCycle(prisma(), 2);
    await prisma().course.update({ where: { id: courses[1]!.id }, data: { isActive: false } });
    const admin = await auth(Role.ADMIN);
    const student = await auth(Role.STUDENT);

    const before = await request(app)
      .get('/api/v1/courses')
      .query({ cycleId: cycle.id })
      .set(student.auth);
    expect(before.status).toBe(200);
    expect(before.body.cycle.id).toBe(cycle.id);
    expect(before.body.courses.map((c: { id: string }) => c.id)).toEqual([courses[0]!.id]);
    expect(before.body.courses[0]).toMatchObject({
      seatCapacity: 10,
      seatsRemaining: 10,
      offering: { windowState: 'OPEN' },
    });

    const e = await request(app)
      .post('/api/v1/enrollments')
      .set(student.auth)
      .send({ cycleId: cycle.id, courseIds: [courses[0]!.id] });
    await request(app).post(`/api/v1/admin/enrollments/${e.body.id}/approve`).set(admin.auth);

    const after = await request(app)
      .get(`/api/v1/courses/${courses[0]!.id}`)
      .query({ cycleId: cycle.id })
      .set(student.auth);
    expect(after.body.course.seatsRemaining).toBe(9);
  });

  it('requires sign-in', async () => {
    expect((await request(app).get('/api/v1/courses')).status).toBe(401);
  });
});
