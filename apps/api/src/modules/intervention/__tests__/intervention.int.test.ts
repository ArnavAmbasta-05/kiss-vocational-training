import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../../app';
import { disconnectPrisma, prisma } from '../../../core/db';
import { withJobLease } from '../../../core/jobs';
import { createLoginUser, createTrainedBatch, uid } from '../../../../test/fixtures';
import { bearer, login } from '../../../../test/http';
import { evaluateAll, evaluateBatch } from '../intervention.service';

const app = createApp();
afterAll(() => disconnectPrisma());
const auth = async (email: string) => bearer((await login(app, email)).accessToken);
const DAY = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);

/** Three students with full attendance and 45/50 on one assessment: nobody is at risk. */
async function world() {
  const db = prisma();
  const w = await createTrainedBatch(db, [
    { attended: 4, marks: 45 },
    { attended: 4, marks: 45 },
    { attended: 4, marks: 45 },
  ]);
  const admin = await createLoginUser(db, Role.ADMIN);
  return {
    ...w,
    admin,
    A: await auth(admin.email),
    T: await auth(w.trainer.email),
    S: await auth(w.students[0]!.user.email),
  };
}
type World = Awaited<ReturnType<typeof world>>;

/** Marks one session through the API; `absent` students are ABSENT, the rest PRESENT. */
const mark = (w: World, session: number, absent: string[]) =>
  request(app)
    .put(`/api/v1/sessions/${w.sessions[session]!.id}/attendance`)
    .set(w.T)
    .send({
      entries: w.students.map((s) => ({
        studentId: s.studentId,
        status: absent.includes(s.studentId) ? 'ABSENT' : 'PRESENT',
      })),
    })
    .expect(200);

const openFlag = (studentId: string, batchId: string) =>
  prisma().riskFlag.findFirst({ where: { studentId, batchId, closedAt: null } });

describe('risk evaluation on save (BRQ-11.1, TAD §8.2 step 6)', () => {
  it('marking attendance flags the student at once and updates the level as it changes', async () => {
    const w = await world();
    const s = w.students[0]!;
    expect(await openFlag(s.studentId, w.batch.id)).toBeNull();

    // 3 of 4 = 75.00 %: below 80 (Medium) but not below 75 (High).
    await mark(w, 3, [s.studentId]);
    let flag = await openFlag(s.studentId, w.batch.id);
    expect(flag).toMatchObject({ level: 'MEDIUM' });
    expect(flag!.reasons).toEqual([
      { code: 'ATTENDANCE_BELOW_MEDIUM', level: 'MEDIUM', actual: 75, threshold: 80 },
    ]);

    // 2 of 4 = 50 %: High; the same flag is updated, not a second one opened.
    await mark(w, 2, [s.studentId]);
    flag = await openFlag(s.studentId, w.batch.id);
    expect(flag).toMatchObject({ level: 'HIGH' });
    expect(await prisma().riskFlag.count({ where: { studentId: s.studentId } })).toBe(1);

    // Nobody else in the batch is flagged.
    expect(await prisma().riskFlag.count({ where: { batchId: w.batch.id } })).toBe(1);
  });

  it('3 consecutive absences are reported as a reason', async () => {
    const w = await world();
    const s = w.students[0]!;
    for (const i of [1, 2, 3]) await mark(w, i, [s.studentId]);
    const flag = await openFlag(s.studentId, w.batch.id);
    const codes = (flag!.reasons as Array<{ code: string }>).map((r) => r.code);
    expect(codes).toEqual(
      expect.arrayContaining(['ATTENDANCE_BELOW_HIGH', 'CONSECUTIVE_ABSENCES']),
    );
  });

  it('a 15-point drop between consecutive assessments is High', async () => {
    const w = await world();
    const s = w.students[0]!;
    const second = await prisma().assessment.create({
      data: {
        batchId: w.batch.id,
        title: 'Mid-term',
        mode: 'THEORY',
        maxMarks: 50,
        weightage: 1,
        createdById: w.trainer.id,
      },
    });
    // 45/50 = 90 % → 37.5/50 = 75 %: exactly 15 points.
    await request(app)
      .put(`/api/v1/assessments/${second.id}/results`)
      .set(w.T)
      .send({ results: [{ studentId: s.studentId, marks: 37.5 }] })
      .expect(200);
    const flag = await openFlag(s.studentId, w.batch.id);
    expect(flag).toMatchObject({ level: 'HIGH' });
    expect(flag!.reasons).toEqual([
      { code: 'SCORE_DROP', level: 'HIGH', actual: 15, threshold: 15 },
    ]);
  });

  it('a gap on a mandatory competency raises a flag (BR-18)', async () => {
    const w = await world();
    const s = w.students[0]!;
    const c = (
      await request(app)
        .post(`/api/v1/courses/${w.course.id}/competencies`)
        .set(w.A)
        .send({
          code: 'WIRE',
          title: 'Safe wiring',
          mode: 'PRACTICAL',
          requiredLevel: 3,
          isMandatory: true,
        })
        .expect(201)
    ).body as { id: string };
    await request(app)
      .put(`/api/v1/batches/${w.batch.id}/competency-ratings`)
      .set(w.T)
      .send({ ratings: [{ studentId: s.studentId, competencyId: c.id, level: 1 }] })
      .expect(200);
    const flag = await openFlag(s.studentId, w.batch.id);
    expect(flag).toMatchObject({ level: 'HIGH' });
    expect(flag!.reasons).toEqual([
      {
        code: 'MANDATORY_GAP',
        level: 'HIGH',
        actual: 2,
        threshold: 3,
        competency: 'Safe wiring',
      },
    ]);
  });

  it('ignores batches that are not active', async () => {
    const w = await world();
    await prisma().attendance.updateMany({
      where: { studentId: w.students[0]!.studentId },
      data: { status: 'ABSENT' },
    });
    await prisma().batch.update({ where: { id: w.batch.id }, data: { status: 'CLOSED' } });
    expect(await evaluateBatch(w.batch.id)).toMatchObject({ batches: 0, opened: 0 });
  });
});

describe('flag lifecycle (BR-17, BRQ-11.4)', () => {
  it('closes after 7 clear days and keeps its history', async () => {
    const w = await world();
    const s = w.students[0]!;
    await mark(w, 2, [s.studentId]); // 3 of 4 → Medium
    const flag = (await openFlag(s.studentId, w.batch.id))!;

    await mark(w, 2, []); // back to 4 of 4: the clear period starts now
    const clearing = await prisma().riskFlag.findUniqueOrThrow({ where: { id: flag.id } });
    expect(clearing.clearSince).not.toBeNull();
    expect(clearing.closedAt).toBeNull();

    const start = clearing.clearSince!.getTime();
    await evaluateBatch(w.batch.id, { now: new Date(start + 6 * DAY) });
    expect(
      (await prisma().riskFlag.findUniqueOrThrow({ where: { id: flag.id } })).closedAt,
    ).toBeNull();

    const summary = await evaluateBatch(w.batch.id, { now: new Date(start + 7 * DAY) });
    expect(summary.closed).toBe(1);
    const closed = await prisma().riskFlag.findUniqueOrThrow({ where: { id: flag.id } });
    expect(closed.closedAt).not.toBeNull();
    // The row and its level stay; the timeline shows every step.
    expect(closed.level).toBe('MEDIUM');
    const detail = await request(app).get(`/api/v1/risk-flags/${flag.id}`).set(w.T).expect(200);
    expect(detail.body.status).toBe('CLOSED');
    expect(detail.body.timeline.map((e: { kind: string }) => e.kind)).toEqual([
      'OPENED',
      'CLEARING',
      'CLOSED',
    ]);
    const closedList = await request(app)
      .get(`/api/v1/risk-flags?batchId=${w.batch.id}&status=CLOSED`)
      .set(w.T)
      .expect(200);
    expect(closedList.body.data.map((r: { id: string }) => r.id)).toEqual([flag.id]);
  });

  it('a risk that returns during the clear period resets it', async () => {
    const w = await world();
    const s = w.students[0]!;
    await mark(w, 2, [s.studentId]);
    await mark(w, 2, []);
    await mark(w, 2, [s.studentId]);
    const flag = (await openFlag(s.studentId, w.batch.id))!;
    expect(flag.clearSince).toBeNull();
  });

  it('escalates a High flag after 14 days to every admin, once', async () => {
    const w = await world();
    const s = w.students[0]!;
    await mark(w, 1, [s.studentId]);
    await mark(w, 2, [s.studentId]); // 2 of 4 → High
    const flag = (await openFlag(s.studentId, w.batch.id))!;
    const opened = flag.openedAt.getTime();

    expect((await evaluateBatch(w.batch.id, { now: new Date(opened + 13 * DAY) })).escalated).toBe(
      0,
    );
    expect((await evaluateBatch(w.batch.id, { now: new Date(opened + 14 * DAY) })).escalated).toBe(
      1,
    );
    expect((await evaluateBatch(w.batch.id, { now: new Date(opened + 15 * DAY) })).escalated).toBe(
      0,
    );

    const notices = await prisma().notification.findMany({
      where: { userId: w.admin.id, type: 'RISK_FLAG_ESCALATED' },
    });
    expect(notices).toHaveLength(1);
    expect(notices[0]!.link).toBe(`/admin/at-risk/${flag.id}`);
    const escalated = await request(app)
      .get(`/api/v1/risk-flags?escalated=true&batchId=${w.batch.id}`)
      .set(w.A)
      .expect(200);
    expect(escalated.body.data).toHaveLength(1);
  });
});

describe('flags, actions and the student view (BRQ-11.2, 11.3, 11.5)', () => {
  async function flagged() {
    const w = await world();
    const s = w.students[0]!;
    await mark(w, 2, [s.studentId]);
    const flag = (await openFlag(s.studentId, w.batch.id))!;
    return { w, s, flag };
  }

  it('lists flags with reasons for the batch trainer and admin; others are refused', async () => {
    const { w, s, flag } = await flagged();
    const res = await request(app)
      .get(`/api/v1/risk-flags?batchId=${w.batch.id}`)
      .set(w.T)
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: flag.id,
      student: { id: s.studentId, fullName: s.user.fullName },
      batch: { id: w.batch.id },
      level: 'MEDIUM',
      status: 'OPEN',
      actionCount: 0,
    });
    // The trainer's unfiltered list only covers their own batches.
    const mine = await request(app).get('/api/v1/risk-flags?pageSize=100').set(w.T).expect(200);
    expect(mine.body.data.every((r: { batch: { id: string } }) => r.batch.id === w.batch.id)).toBe(
      true,
    );
    await request(app).get(`/api/v1/risk-flags/${flag.id}`).set(w.A).expect(200);

    const other = await createLoginUser(prisma(), Role.TRAINER);
    const O = await auth(other.email);
    await request(app).get(`/api/v1/risk-flags?batchId=${w.batch.id}`).set(O).expect(403);
    await request(app).get(`/api/v1/risk-flags/${flag.id}`).set(O).expect(403);
    await request(app).get('/api/v1/risk-flags').set(w.S).expect(403);
    await request(app).get(`/api/v1/risk-flags/${flag.id}`).set(w.S).expect(403);
  });

  it('records an action with owner and due date, then its outcome; the student sees it gently', async () => {
    const { w, s, flag } = await flagged();
    const url = `/api/v1/risk-flags/${flag.id}/actions`;

    const past = await request(app)
      .post(url)
      .set(w.T)
      .send({ type: 'COUNSELLING', ownerId: w.trainer.id, dueOn: '2020-01-01' });
    expect(past.status).toBe(422);
    expect(past.body.error.code).toBe('DUE_IN_PAST');
    const stranger = await request(app)
      .post(url)
      .set(w.T)
      .send({ type: 'COUNSELLING', ownerId: s.user.id, dueOn: today() });
    expect(stranger.status).toBe(422);
    expect(stranger.body.error.code).toBe('INVALID_OWNER');

    const created = await request(app)
      .post(url)
      .set(w.T)
      .send({ type: 'EXTRA_SESSION', ownerId: w.trainer.id, dueOn: today(), note: 'Staff only' })
      .expect(201);
    const action = created.body.actions[0];
    expect(action).toMatchObject({
      type: 'EXTRA_SESSION',
      owner: { id: w.trainer.id },
      dueOn: today(),
      completedAt: null,
    });
    expect(created.body.ownerOptions.map((o: { id: string }) => o.id)).toEqual(
      expect.arrayContaining([w.trainer.id, w.admin.id]),
    );

    // The student: their flag, reasons and the agreed action — no staff note.
    const mine = await request(app).get('/api/v1/students/me/risk').set(w.S).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ id: flag.id, level: 'MEDIUM' });
    expect(mine.body[0].actions).toEqual([
      {
        id: action.id,
        type: 'EXTRA_SESSION',
        owner: w.trainer.fullName,
        dueOn: today(),
        completedAt: null,
      },
    ]);
    expect(JSON.stringify(mine.body)).not.toContain('Staff only');
    const notice = await prisma().notification.findFirst({
      where: { userId: s.user.id, type: 'RISK_ACTION_AGREED' },
    });
    expect(notice).not.toBeNull();
    // Other students see nothing.
    const other = await request(app)
      .get('/api/v1/students/me/risk')
      .set(await auth(w.students[1]!.user.email))
      .expect(200);
    expect(other.body).toEqual([]);

    const done = await request(app)
      .patch(`/api/v1/risk-actions/${action.id}`)
      .set(w.T)
      .send({ outcome: 'Attended and caught up' })
      .expect(200);
    expect(done.body.actions[0].outcome).toBe('Attended and caught up');
    expect(done.body.actions[0].completedAt).not.toBeNull();
    expect(done.body.timeline.map((e: { kind: string }) => e.kind)).toEqual([
      'OPENED',
      'ACTION_ADDED',
      'ACTION_COMPLETED',
    ]);
    expect(done.body.timeline[1].by).toBe(w.trainer.fullName);

    // Another trainer may not touch it.
    const O = await auth((await createLoginUser(prisma(), Role.TRAINER)).email);
    await request(app)
      .patch(`/api/v1/risk-actions/${action.id}`)
      .set(O)
      .send({ outcome: 'Not mine' })
      .expect(403);
  });

  it('refuses actions on a closed flag', async () => {
    const { w, flag } = await flagged();
    await prisma().riskFlag.update({ where: { id: flag.id }, data: { closedAt: new Date() } });
    const res = await request(app)
      .post(`/api/v1/risk-flags/${flag.id}/actions`)
      .set(w.T)
      .send({ type: 'PRACTICE_TASK', ownerId: w.trainer.id, dueOn: today() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FLAG_CLOSED');
  });
});

describe('the scheduled job (TAD §8.2, Amendment 1)', () => {
  it('two runs never overlap: the second is refused while the first holds the lease', async () => {
    const job = `test-${uid()}`;
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const first = withJobLease(job, 60_000, async () => {
      await held;
      return 'first';
    });
    // Let the first claim land before the second tries.
    await new Promise((r) => setTimeout(r, 200));
    expect(await withJobLease(job, 60_000, async () => 'second')).toEqual({ ran: false });
    release();
    expect(await first).toEqual({ ran: true, result: 'first' });
    expect(await withJobLease(job, 60_000, async () => 'third')).toEqual({
      ran: true,
      result: 'third',
    });
  });

  it('stops between batches when the time budget runs out and says how many are left', async () => {
    await world(); // at least one ACTIVE batch
    const r = await evaluateAll({ budgetMs: -1 });
    expect(r).toMatchObject({ skipped: false, partial: true, batches: 0 });
    expect(r.remaining).toBeGreaterThan(0);
  });

  it('the cron endpoint needs the secret; a run in progress makes it report skipped', async () => {
    const url = '/api/v1/internal/jobs/risk-evaluation';
    await request(app).get(url).expect(401);
    await request(app).get(url).set('Authorization', 'Bearer wrong-secret-0000000000').expect(401);

    // Hold the real job's lease so the endpoint doesn't evaluate every batch in the test DB.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const holder = withJobLease('risk-evaluation', 60_000, () => held);
    await new Promise((r) => setTimeout(r, 200));
    const res = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${process.env.CRON_SECRET}`)
      .expect(200);
    expect(res.body.skipped).toBe(true);
    release();
    await holder;
  });
});
