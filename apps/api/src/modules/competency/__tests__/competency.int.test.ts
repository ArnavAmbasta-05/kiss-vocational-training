import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../../app';
import { disconnectPrisma, prisma } from '../../../core/db';
import { createActiveBatch, createLoginUser, createTrainedBatch } from '../../../../test/fixtures';
import { bearer, login } from '../../../../test/http';

const app = createApp();
afterAll(() => disconnectPrisma());
const auth = async (email: string) => bearer((await login(app, email)).accessToken);

/**
 * A trained batch (one assessment out of 50: first student 45, second none) plus an admin,
 * and two competencies on its course: WIRE (required 3, mandatory, linked to the assessment)
 * and EARTH (required 3, not linked).
 */
async function world() {
  const db = prisma();
  const w = await createTrainedBatch(db, [{ attended: 4, marks: 45 }, { attended: 4 }]);
  const admin = await createLoginUser(db, Role.ADMIN);
  const A = await auth(admin.email);
  const T = await auth(w.trainer.email);
  const make = async (body: Record<string, unknown>) => {
    const res = await request(app)
      .post(`/api/v1/courses/${w.course.id}/competencies`)
      .set(A)
      .send({ mode: 'PRACTICAL', requiredLevel: 3, isMandatory: true, assessmentIds: [], ...body });
    expect(res.status).toBe(201);
    return res.body as { id: string; code: string };
  };
  const wire = await make({
    code: 'wire-1',
    title: 'Wire a single-phase distribution board',
    assessmentIds: [w.assessment.id],
  });
  const earth = await make({ code: 'EARTH-1', title: 'Test earthing resistance' });
  return { ...w, admin, A, T, wire, earth };
}

const rate = (
  w: Awaited<ReturnType<typeof world>>,
  who: Record<string, string>,
  ratings: Array<{ studentId: string; competencyId: string; level: number; verify?: boolean }>,
) =>
  request(app).put(`/api/v1/batches/${w.batch.id}/competency-ratings`).set(who).send({ ratings });

describe('competencies (BRQ-C.1)', () => {
  it('admin defines them with linked assessments; codes are unique per course', async () => {
    const w = await world();
    expect(w.wire.code).toBe('WIRE-1');
    const list = await request(app).get(`/api/v1/courses/${w.course.id}/competencies`).set(w.T);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.find((c: { code: string }) => c.code === 'WIRE-1')).toMatchObject({
      requiredLevel: 3,
      isMandatory: true,
      assessments: [{ id: w.assessment.id, title: 'Final practical' }],
      resourceCount: 0,
    });

    const dup = await request(app)
      .post(`/api/v1/courses/${w.course.id}/competencies`)
      .set(w.A)
      .send({
        code: 'WIRE-1',
        title: 'Again',
        mode: 'THEORY',
        requiredLevel: 2,
        isMandatory: false,
      });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('COMPETENCY_CODE_TAKEN');

    const other = await createActiveBatch(prisma(), { students: 1, sessions: 1 });
    const foreignAssessment = await prisma().assessment.create({
      data: {
        batchId: other.batch.id,
        title: 'Elsewhere',
        mode: 'THEORY',
        maxMarks: 10,
        weightage: 1,
        createdById: other.trainer.id,
      },
    });
    const foreign = await request(app)
      .put(`/api/v1/competencies/${w.wire.id}`)
      .set(w.A)
      .send({
        code: 'WIRE-1',
        title: 'Wire',
        mode: 'PRACTICAL',
        requiredLevel: 3,
        isMandatory: true,
        assessmentIds: [foreignAssessment.id],
      });
    expect(foreign.status).toBe(422);
    expect(foreign.body.error.code).toBe('ASSESSMENT_NOT_IN_COURSE');

    expect(
      (
        await request(app).post(`/api/v1/courses/${w.course.id}/competencies`).set(w.T).send({
          code: 'X1',
          title: 'Trainer try',
          mode: 'THEORY',
          requiredLevel: 1,
          isMandatory: false,
        })
      ).status,
    ).toBe(403);
  });
});

describe('ratings and verification (BRQ-C.2, BR-13)', () => {
  it('the batch trainer rates in bulk; verify is refused below the required level', async () => {
    const w = await world();
    const [s1, s2] = w.students;
    const tooLow = await rate(w, w.T, [
      { studentId: s1!.studentId, competencyId: w.earth.id, level: 3, verify: true },
      { studentId: s2!.studentId, competencyId: w.earth.id, level: 2, verify: true },
    ]);
    expect(tooLow.status).toBe(422);
    expect(tooLow.body.error.code).toBe('BELOW_REQUIRED_LEVEL');
    expect(tooLow.body.error.details).toEqual([
      { path: `${s2!.studentId}:${w.earth.id}`, message: 'Level 2 is below the required 3' },
    ]);
    // Nothing saved from the refused request.
    expect(await prisma().competencyRating.count({ where: { batchId: w.batch.id } })).toBe(0);

    const ok = await rate(w, w.T, [
      { studentId: s1!.studentId, competencyId: w.earth.id, level: 3, verify: true },
      { studentId: s2!.studentId, competencyId: w.earth.id, level: 1 },
    ]);
    expect(ok.status).toBe(200);
    expect(ok.body.ratings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ studentId: s1!.studentId, level: 3, verified: true }),
        expect.objectContaining({ studentId: s2!.studentId, level: 1, verified: false }),
      ]),
    );

    // Raising a verified rating is fine; taking it below the required level is not.
    expect(
      (await rate(w, w.T, [{ studentId: s1!.studentId, competencyId: w.earth.id, level: 4 }]))
        .status,
    ).toBe(200);
    const lower = await rate(w, w.T, [
      { studentId: s1!.studentId, competencyId: w.earth.id, level: 2 },
    ]);
    expect(lower.status).toBe(409);
    expect(lower.body.error.code).toBe('VERIFIED_LOCKED');

    const actions = (
      await prisma().auditLog.findMany({
        where: { entity: 'CompetencyRating' },
        orderBy: { createdAt: 'asc' },
        select: { action: true, entityId: true },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'COMPETENCY_VERIFIED',
        'COMPETENCY_RATED',
        'COMPETENCY_RATING_UPDATED',
      ]),
    );
  });

  it('another trainer, an admin, a student or a stranger in the roster are refused', async () => {
    const w = await world();
    const s1 = w.students[0]!;
    const cell = [{ studentId: s1.studentId, competencyId: w.earth.id, level: 2 }];
    const otherTrainer = await createLoginUser(prisma(), Role.TRAINER);
    expect((await rate(w, await auth(otherTrainer.email), cell)).status).toBe(403);
    expect((await rate(w, w.A, cell)).status).toBe(403);
    expect((await rate(w, await auth(s1.user.email), cell)).status).toBe(403);

    const outsider = await createLoginUser(prisma(), Role.STUDENT);
    const res = await rate(w, w.T, [
      { studentId: outsider.student!.id, competencyId: w.earth.id, level: 2 },
    ]);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NOT_IN_BATCH');

    // Rated competencies can't be deleted.
    await rate(w, w.T, cell).expect(200);
    const del = await request(app).delete(`/api/v1/competencies/${w.earth.id}`).set(w.A);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('HAS_RATINGS');
  });
});

describe('gaps and recommendations (BRQ-12.1–12.3, BR-18)', () => {
  it('BRD acceptance: level 1 on a level-3 competency → gap 2 with a recommended action', async () => {
    const w = await world();
    const [s1, s2] = w.students;
    // Admin resource: curated at once. Trainer resource: recommended only after approval.
    const adminRes = await request(app).post('/api/v1/resources').set(w.A).send({
      competencyId: w.earth.id,
      title: 'Earthing system basics',
      type: 'DOCUMENT',
      url: 'https://en.wikipedia.org/wiki/Earthing_system',
    });
    expect(adminRes.status).toBe(201);
    expect(adminRes.body.approved).toBe(true);
    const trainerRes = await request(app).post('/api/v1/resources').set(w.T).send({
      competencyId: w.earth.id,
      title: 'Practice: measure earth resistance',
      type: 'PRACTICE_TASK',
      url: 'https://example.org/earth-practice',
    });
    expect(trainerRes.body.approved).toBe(false);
    await rate(w, w.T, [{ studentId: s2!.studentId, competencyId: w.earth.id, level: 1 }]).expect(
      200,
    );

    const S2 = await auth(s2!.user.email);
    const gaps = await request(app).get('/api/v1/students/me/gaps').set(S2);
    expect(gaps.status).toBe(200);
    const earth = gaps.body.belowLevel.find((g: { code: string }) => g.code === 'EARTH-1');
    expect(earth).toMatchObject({
      requiredLevel: 3,
      demonstratedLevel: 1,
      source: 'RATING',
      gap: 2,
    });
    expect(earth.recommendations).toEqual([
      expect.objectContaining({ title: 'Earthing system basics', type: 'DOCUMENT' }),
    ]);
    // WIRE has no rating and no result for this student: not assessed, listed separately.
    expect(gaps.body.notAssessed.map((g: { code: string }) => g.code)).toEqual(['WIRE-1']);

    await request(app).post(`/api/v1/resources/${trainerRes.body.id}/approve`).set(w.A).expect(200);
    const after = await request(app).get('/api/v1/students/me/gaps').set(S2);
    expect(
      after.body.belowLevel.find((g: { code: string }) => g.code === 'EARTH-1').recommendations,
    ).toHaveLength(2);

    // The first student's 45/50 = 90 % on the linked assessment gives a provisional level 4.
    const first = await request(app).get(`/api/v1/students/${s1!.studentId}/gaps`).set(w.T);
    expect(first.body.met).toEqual([
      expect.objectContaining({
        code: 'WIRE-1',
        demonstratedLevel: 4,
        source: 'PROVISIONAL',
        gap: 0,
      }),
    ]);
    // A student can't read another student's gaps.
    expect((await request(app).get(`/api/v1/students/${s1!.studentId}/gaps`).set(S2)).status).toBe(
      403,
    );
  });

  it('heatmap flags every student below level (BRQ-12.4)', async () => {
    const w = await world();
    const [s1, s2] = w.students;
    await rate(w, w.T, [
      { studentId: s1!.studentId, competencyId: w.earth.id, level: 2 },
      { studentId: s2!.studentId, competencyId: w.earth.id, level: 1 },
    ]).expect(200);
    const res = await request(app).get(`/api/v1/batches/${w.batch.id}/competency-heatmap`).set(w.T);
    expect(res.status).toBe(200);
    expect(res.body.competencies.map((c: { code: string }) => c.code)).toEqual([
      'EARTH-1',
      'WIRE-1',
    ]);
    const cell = (studentId: string, code: string) => {
      const row = res.body.rows.find((r: { studentId: string }) => r.studentId === studentId);
      const i = res.body.competencies.findIndex((c: { code: string }) => c.code === code);
      return row.cells[i];
    };
    expect(cell(s1!.studentId, 'EARTH-1')).toMatchObject({ level: 2, gap: 1, below: true });
    expect(cell(s2!.studentId, 'EARTH-1')).toMatchObject({ level: 1, gap: 2, below: true });
    expect(cell(s1!.studentId, 'WIRE-1')).toMatchObject({ source: 'PROVISIONAL', below: false });
    expect(cell(s2!.studentId, 'WIRE-1')).toMatchObject({ source: 'NOT_ASSESSED', below: false });

    const stranger = await createLoginUser(prisma(), Role.TRAINER);
    expect(
      (
        await request(app)
          .get(`/api/v1/batches/${w.batch.id}/competency-heatmap`)
          .set(await auth(stranger.email))
      ).status,
    ).toBe(403);
  });
});
