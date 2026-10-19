import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../../app';
import { disconnectPrisma, prisma } from '../../../core/db';
import {
  createApprovedApplicants,
  createBatch,
  createLoginUser,
  createOpenCycle,
  uid,
} from '../../../../test/fixtures';
import { bearer, login } from '../../../../test/http';

const app = createApp();
let admin: Record<string, string>;
beforeAll(async () => {
  const user = await createLoginUser(prisma(), Role.ADMIN);
  admin = bearer((await login(app, user.email)).accessToken);
});
afterAll(() => disconnectPrisma());

async function signedIn(role: Role) {
  const user = await createLoginUser(prisma(), role);
  return { user, auth: bearer((await login(app, user.email)).accessToken) };
}
const place = (batchId: string, enrollmentId: string) =>
  request(app).post(`/api/v1/admin/batches/${batchId}/students`).set(admin).send({ enrollmentId });

describe('admin batches (BRQ-4.1)', () => {
  it('creates a batch, refuses a duplicate name and capacity below enrolled', async () => {
    const { cycle, courses } = await createOpenCycle(prisma(), 1);
    const body = {
      courseId: courses[0]!.id,
      cycleId: cycle.id,
      name: `Morning ${uid()}`,
      capacity: 1,
      startDate: '2027-01-04',
      endDate: '2027-03-31',
      venue: 'Workshop A',
    };
    const created = await request(app).post('/api/v1/admin/batches').set(admin).send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'PLANNED', enrolled: 0, capacity: 1 });
    expect(
      (await request(app).post('/api/v1/admin/batches').set(admin).send(body)).body.error.code,
    ).toBe('BATCH_NAME_TAKEN');

    const [e] = await createApprovedApplicants(prisma(), cycle.id, [[courses[0]!.id]]);
    expect((await place(created.body.id, e!)).status).toBe(200);
    const lower = await request(app)
      .patch(`/api/v1/admin/batches/${created.body.id}`)
      .set(admin)
      .send({ capacity: 2 });
    expect(lower.status).toBe(200);
    const tooLow = await request(app)
      .patch(`/api/v1/admin/batches/${created.body.id}`)
      .set(admin)
      .send({ capacity: 0 });
    expect(tooLow.status).toBe(422);
  });
});

describe('placing students (BRQ-4.4, BR-03)', () => {
  it('places an approved applicant, then refuses when the batch is full (TC-06)', async () => {
    const { cycle, courses } = await createOpenCycle(prisma(), 1);
    const b = await createBatch(prisma(), cycle.id, courses[0]!.id, 1);
    const [e1, e2] = await createApprovedApplicants(prisma(), cycle.id, [
      [courses[0]!.id],
      [courses[0]!.id],
    ]);

    const ok = await place(b.id, e1!);
    expect(ok.status).toBe(200);
    expect(ok.body.roster).toHaveLength(1);
    expect((await prisma().enrollment.findUniqueOrThrow({ where: { id: e1! } })).status).toBe(
      'ALLOCATED',
    );

    const full = await place(b.id, e2!);
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('BATCH_FULL');
    expect((await place(b.id, e1!)).body.error.code).toBe('NOT_PLACEABLE');
  });

  it('promotes a waitlisted applicant and refuses courses they did not choose', async () => {
    const { cycle, courses } = await createOpenCycle(prisma(), 2);
    const b = await createBatch(prisma(), cycle.id, courses[0]!.id, 5);
    const [waitlisted] = await createApprovedApplicants(prisma(), cycle.id, [[courses[0]!.id]], {
      status: 'WAITLISTED',
    });
    const [other] = await createApprovedApplicants(prisma(), cycle.id, [[courses[1]!.id]]);
    expect((await place(b.id, waitlisted!)).status).toBe(200);
    expect((await place(b.id, other!)).body.error.code).toBe('COURSE_NOT_PREFERRED');
  });

  it('moves a student only into a batch with room (TC-07) and removes back to APPROVED', async () => {
    const { cycle, courses } = await createOpenCycle(prisma(), 1);
    const a = await createBatch(prisma(), cycle.id, courses[0]!.id, 2);
    const full = await createBatch(prisma(), cycle.id, courses[0]!.id, 1);
    const roomy = await createBatch(prisma(), cycle.id, courses[0]!.id, 3);
    const [e1, e2] = await createApprovedApplicants(prisma(), cycle.id, [
      [courses[0]!.id],
      [courses[0]!.id],
    ]);
    await place(a.id, e1!);
    await place(full.id, e2!);

    const move = (to: string) =>
      request(app)
        .post(`/api/v1/admin/batches/${a.id}/students/${e1}/move`)
        .set(admin)
        .send({ toBatchId: to });
    const blocked = await move(full.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('BATCH_FULL');
    const moved = await move(roomy.id);
    expect(moved.status).toBe(200);
    expect(moved.body.id).toBe(roomy.id);
    expect(await prisma().batchStudent.count({ where: { batchId: a.id } })).toBe(0);

    const removed = await request(app)
      .delete(`/api/v1/admin/batches/${roomy.id}/students/${e1}`)
      .set(admin);
    expect(removed.status).toBe(200);
    expect((await prisma().enrollment.findUniqueOrThrow({ where: { id: e1! } })).status).toBe(
      'APPROVED',
    );
    expect(
      await prisma().auditLog.count({ where: { action: 'BATCH_STUDENT_MOVED', entityId: e1! } }),
    ).toBe(1);
  });
});

describe('trainers, activation and visibility (BR-05, NFR-08)', () => {
  it('trainers see only their batches; students see their batch without the roster', async () => {
    const { cycle, courses } = await createOpenCycle(prisma(), 1);
    const b = await createBatch(prisma(), cycle.id, courses[0]!.id, 5);
    const mineT = await signedIn(Role.TRAINER);
    const otherT = await signedIn(Role.TRAINER);
    const assign = await request(app)
      .post(`/api/v1/admin/batches/${b.id}/trainers`)
      .set(admin)
      .send({ trainerId: mineT.user.trainer!.id });
    expect(assign.status).toBe(200);

    const student = await signedIn(Role.STUDENT);
    const e = await prisma().enrollment.create({
      data: {
        studentId: student.user.student!.id,
        cycleId: cycle.id,
        status: 'APPROVED',
        preferences: { create: { courseId: courses[0]!.id, rank: 1 } },
      },
    });
    await place(b.id, e.id);

    const mine = await request(app).get('/api/v1/batches/mine').set(mineT.auth);
    expect(mine.body.map((x: { id: string }) => x.id)).toContain(b.id);
    expect(
      (await request(app).get('/api/v1/batches/mine').set(otherT.auth)).body.map(
        (x: { id: string }) => x.id,
      ),
    ).not.toContain(b.id);

    const roster = await request(app).get(`/api/v1/batches/${b.id}`).set(mineT.auth);
    expect(roster.status).toBe(200);
    expect(roster.body.roster).toHaveLength(1);
    expect((await request(app).get(`/api/v1/batches/${b.id}`).set(otherT.auth)).status).toBe(403);

    const asStudent = await request(app).get(`/api/v1/batches/${b.id}`).set(student.auth);
    expect(asStudent.status).toBe(200);
    expect(asStudent.body.roster).toBeNull();
    expect((await request(app).get('/api/v1/batches/mine').set(student.auth)).body[0].id).toBe(
      b.id,
    );
  });

  it('activation needs a trainer, then makes the students ACTIVE', async () => {
    const { cycle, courses } = await createOpenCycle(prisma(), 1);
    const b = await createBatch(prisma(), cycle.id, courses[0]!.id, 5);
    const [e] = await createApprovedApplicants(prisma(), cycle.id, [[courses[0]!.id]]);
    await place(b.id, e!);

    const noTrainer = await request(app).post(`/api/v1/admin/batches/${b.id}/activate`).set(admin);
    expect(noTrainer.body.error.code).toBe('NO_TRAINER');
    const t = await signedIn(Role.TRAINER);
    await request(app)
      .post(`/api/v1/admin/batches/${b.id}/trainers`)
      .set(admin)
      .send({ trainerId: t.user.trainer!.id });
    const ok = await request(app).post(`/api/v1/admin/batches/${b.id}/activate`).set(admin);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('ACTIVE');
    expect((await prisma().enrollment.findUniqueOrThrow({ where: { id: e! } })).status).toBe(
      'ACTIVE',
    );
    expect(
      (await request(app).post(`/api/v1/admin/batches/${b.id}/activate`).set(admin)).body.error
        .code,
    ).toBe('INVALID_BATCH_STATUS');
  });
});

describe('sessions (BRQ-4.3)', () => {
  it('schedules single and recurring sessions inside the batch dates, and cancels one', async () => {
    const { cycle, courses } = await createOpenCycle(prisma(), 1);
    const b = await createBatch(prisma(), cycle.id, courses[0]!.id, 5);
    const path = `/api/v1/admin/batches/${b.id}/sessions`;

    const single = await request(app).post(path).set(admin).send({
      kind: 'single',
      startsAt: '2027-01-05T04:30:00Z',
      endsAt: '2027-01-05T06:30:00Z',
      topic: 'Safety basics',
    });
    expect(single.status).toBe(201);
    expect(single.body[0]).toMatchObject({
      venue: 'Workshop A',
      status: 'SCHEDULED',
      topic: 'Safety basics',
    });

    const weekly = await request(app)
      .post(path)
      .set(admin)
      .send({
        kind: 'recurring',
        daysOfWeek: ['MON', 'WED'],
        startTime: '10:00',
        endTime: '12:00',
        from: '2027-01-11',
        until: '2027-01-20',
      });
    expect(weekly.status).toBe(201);
    expect(weekly.body.map((s: { startsAt: string }) => s.startsAt)).toEqual([
      '2027-01-11T04:30:00.000Z',
      '2027-01-13T04:30:00.000Z',
      '2027-01-18T04:30:00.000Z',
      '2027-01-20T04:30:00.000Z',
    ]);

    const outside = await request(app).post(path).set(admin).send({
      kind: 'single',
      startsAt: '2027-05-01T04:30:00Z',
      endsAt: '2027-05-01T06:30:00Z',
    });
    expect(outside.body.error.code).toBe('OUTSIDE_BATCH_DATES');

    const cancel = await request(app)
      .patch(`${path}/${single.body[0].id}`)
      .set(admin)
      .send({ status: 'CANCELLED' });
    expect(cancel.body.status).toBe('CANCELLED');
  });
});
