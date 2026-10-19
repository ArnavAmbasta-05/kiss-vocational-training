import express from 'express';
import request from 'supertest';
import { Prisma, Role } from '@prisma/client';
import { authenticate, authorize, owns, requireOwnership, signAccessToken } from '..';
import { disconnectPrisma, prisma } from '../../db';
import { errorHandler } from '../../errors';
import { createCycleCourseBatch, createLoginUser } from '../../../../test/fixtures';
import { bearer } from '../../../../test/http';

/** A stand-in for the batch/session/assessment routes later sprints will build. */
const app = express();
const ok = (_req: express.Request, res: express.Response) => res.json({ ok: true });
app.get('/batches/:batchId', authenticate, requireOwnership(owns.batch()), ok);
app.get('/sessions/:sessionId', authenticate, requireOwnership(owns.session()), ok);
app.get('/assessments/:assessmentId', authenticate, requireOwnership(owns.assessment()), ok);
app.get('/students/:studentId', authenticate, requireOwnership(owns.student()), ok);
app.get(
  '/trainer-only/:batchId',
  authenticate,
  authorize('TRAINER'),
  requireOwnership(owns.batch()),
  ok,
);
app.use(errorHandler);

const tokenFor = (u: { id: string; role: Role }) => bearer(signAccessToken(u).token);

let trainerA: Awaited<ReturnType<typeof createLoginUser>>;
let trainerB: Awaited<ReturnType<typeof createLoginUser>>;
let admin: Awaited<ReturnType<typeof createLoginUser>>;
let member: Awaited<ReturnType<typeof createLoginUser>>;
let outsider: Awaited<ReturnType<typeof createLoginUser>>;
let batchId: string;
let sessionId: string;
let assessmentId: string;

beforeAll(async () => {
  const db = prisma();
  [trainerA, trainerB, admin, member, outsider] = await Promise.all([
    createLoginUser(db, Role.TRAINER),
    createLoginUser(db, Role.TRAINER),
    createLoginUser(db, Role.ADMIN),
    createLoginUser(db, Role.STUDENT),
    createLoginUser(db, Role.STUDENT),
  ]);
  const { batch, cycle } = await createCycleCourseBatch(db);
  batchId = batch.id;
  await db.trainerAssignment.create({ data: { batchId, trainerId: trainerA.trainer!.id } });
  const enrollment = await db.enrollment.create({
    data: { studentId: member.student!.id, cycleId: cycle.id, status: 'ALLOCATED' },
  });
  await db.batchStudent.create({
    data: { batchId, enrollmentId: enrollment.id, studentId: member.student!.id },
  });
  const session = await db.trainingSession.create({
    data: {
      batchId,
      startsAt: new Date('2027-01-05T04:00:00Z'),
      endsAt: new Date('2027-01-05T06:00:00Z'),
      venue: 'Workshop A',
    },
  });
  sessionId = session.id;
  const assessment = await db.assessment.create({
    data: {
      batchId,
      title: 'Quiz',
      mode: 'THEORY',
      maxMarks: new Prisma.Decimal(20),
      weightage: new Prisma.Decimal(10),
      createdById: admin.id,
    },
  });
  assessmentId = assessment.id;
});

afterAll(() => disconnectPrisma());

describe('BR-05: trainers act only on assigned batches', () => {
  it('lets the assigned trainer in', async () => {
    expect((await request(app).get(`/batches/${batchId}`).set(tokenFor(trainerA))).status).toBe(
      200,
    );
  });

  it("returns 403 for another trainer's batch, session and assessment", async () => {
    for (const path of [
      `/batches/${batchId}`,
      `/sessions/${sessionId}`,
      `/assessments/${assessmentId}`,
    ]) {
      const res = await request(app).get(path).set(tokenFor(trainerB));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('returns 404 for an unknown or malformed id', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await request(app).get(`/batches/${unknown}`).set(tokenFor(trainerA))).status).toBe(
      404,
    );
    expect((await request(app).get('/batches/not-a-uuid').set(tokenFor(trainerA))).status).toBe(
      404,
    );
  });

  it('lets admins into any batch', async () => {
    expect((await request(app).get(`/sessions/${sessionId}`).set(tokenFor(admin))).status).toBe(
      200,
    );
  });

  it('checks role before ownership', async () => {
    const res = await request(app).get(`/trainer-only/${batchId}`).set(tokenFor(member));
    expect(res.status).toBe(403);
  });
});

describe('students see only their own records', () => {
  it('allows a batch member and refuses an outsider', async () => {
    expect((await request(app).get(`/batches/${batchId}`).set(tokenFor(member))).status).toBe(200);
    expect((await request(app).get(`/batches/${batchId}`).set(tokenFor(outsider))).status).toBe(
      403,
    );
  });

  it('accepts "me" and the own id, refuses another student', async () => {
    expect((await request(app).get('/students/me').set(tokenFor(member))).status).toBe(200);
    expect(
      (await request(app).get(`/students/${member.student!.id}`).set(tokenFor(member))).status,
    ).toBe(200);
    expect(
      (await request(app).get(`/students/${member.student!.id}`).set(tokenFor(outsider))).status,
    ).toBe(403);
  });

  it("lets the student's trainer read them, but not another trainer", async () => {
    const path = `/students/${member.student!.id}`;
    expect((await request(app).get(path).set(tokenFor(trainerA))).status).toBe(200);
    expect((await request(app).get(path).set(tokenFor(trainerB))).status).toBe(403);
  });
});
