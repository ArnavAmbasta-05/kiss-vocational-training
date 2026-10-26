import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../../app';
import { disconnectPrisma, prisma } from '../../../core/db';
import { signLocalGrant } from '../../../core/storage';
import { createLoginUser, createTrainedBatch } from '../../../../test/fixtures';
import { bearer, login } from '../../../../test/http';

const app = createApp();
afterAll(() => disconnectPrisma());
const auth = async (email: string) => bearer((await login(app, email)).accessToken);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
/** The local driver's links are absolute (PUBLIC_BASE_URL); supertest needs the path. */
const pathOf = (url: string) => new URL(url).pathname;

/** A batch with one practical assessment, two students with marks, and a practical competency. */
async function world() {
  const db = prisma();
  const w = await createTrainedBatch(db, [
    { attended: 4, marks: 45 },
    { attended: 4, marks: 30 },
  ]);
  const admin = await createLoginUser(db, Role.ADMIN);
  const A = await auth(admin.email);
  const T = await auth(w.trainer.email);
  const comp = (
    await request(app)
      .post(`/api/v1/courses/${w.course.id}/competencies`)
      .set(A)
      .send({
        code: 'JOINT',
        title: 'Make a sound joint',
        mode: 'PRACTICAL',
        requiredLevel: 3,
        isMandatory: false,
      })
      .expect(201)
  ).body as { id: string };
  const results = await db.assessmentResult.findMany({
    where: { assessmentId: w.assessment.id },
    orderBy: { marks: 'desc' },
  });
  return { ...w, A, T, comp, resultId: results[0]!.id, otherResultId: results[1]!.id };
}
type World = Awaited<ReturnType<typeof world>>;

const rubric = {
  criteria: [
    { key: 'safety', name: 'Works safely' },
    { key: 'finish', name: 'Neat finish' },
  ],
  levels: [
    { value: 1, label: 'Beginning' },
    { value: 2, label: 'Developing' },
    { value: 3, label: 'Proficient' },
  ],
};

/** Gets an upload link and PUTs the file to it, as the browser does. */
async function upload(w: World, body = PNG, contentType = 'image/png') {
  const target = await request(app)
    .post('/api/v1/evidence/upload-url')
    .set(w.T)
    .send({ resultId: w.resultId, fileName: 'joint.png', contentType, sizeBytes: body.length })
    .expect(200);
  expect(target.body.driver).toBe('local');
  expect(target.body.key).toMatch(new RegExp(`^evidence/${w.resultId}/[0-9a-f-]+\\.png$`));
  await request(app)
    .put(pathOf(target.body.url))
    .set('Content-Type', contentType)
    .send(body)
    .expect(201);
  return target.body.key as string;
}

describe('rubrics (BRQ-18.2)', () => {
  it('the trainer saves a rubric for a practical assessment; scores must fit it', async () => {
    const w = await world();
    const saved = await request(app)
      .put(`/api/v1/assessments/${w.assessment.id}/rubric`)
      .set(w.T)
      .send(rubric)
      .expect(200);
    expect(saved.body).toMatchObject({ assessmentId: w.assessment.id, criteria: rubric.criteria });

    const bad = await request(app)
      .post(`/api/v1/results/${w.resultId}/evidence`)
      .set(w.T)
      .send({ kind: 'LINK', url: 'https://example.org/v/1', scores: { safety: 9 } });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('INVALID_SCORES');

    const theory = await prisma().assessment.create({
      data: {
        batchId: w.batch.id,
        title: 'Quiz',
        mode: 'THEORY',
        maxMarks: 10,
        weightage: 1,
        createdById: w.trainer.id,
      },
    });
    const refused = await request(app)
      .put(`/api/v1/assessments/${theory.id}/rubric`)
      .set(w.T)
      .send(rubric);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('NOT_PRACTICAL');
  });
});

describe('uploads (BRQ-18.1, NFR-14, TAD §9)', () => {
  it('refuses a wrong type or an oversized file before any upload', async () => {
    const w = await world();
    const ask = (contentType: string, sizeBytes: number) =>
      request(app)
        .post('/api/v1/evidence/upload-url')
        .set(w.T)
        .send({ resultId: w.resultId, fileName: 'x', contentType, sizeBytes });
    const video = await ask('video/mp4', 1000);
    expect(video.status).toBe(422);
    expect(video.body.error.code).toBe('UNSUPPORTED_TYPE');
    const big = await ask('image/png', 10 * 1024 * 1024 + 1);
    expect(big.status).toBe(422);
    expect(big.body.error.code).toBe('FILE_TOO_LARGE');
    await ask('application/pdf', 10 * 1024 * 1024).expect(200);
  });

  it('the upload link accepts only its own type and size, once, before it expires', async () => {
    const w = await world();
    const key = `evidence/${w.resultId}/manual-test.png`;
    const link = (over: Partial<Parameters<typeof signLocalGrant>[0]> = {}) =>
      `/api/v1/files/${signLocalGrant({
        op: 'put',
        key,
        contentType: 'image/png',
        maxBytes: 100,
        exp: Date.now() + 60_000,
        ...over,
      })}`;
    const wrongType = await request(app)
      .put(link())
      .set('Content-Type', 'application/pdf')
      .send(PNG);
    expect(wrongType.status).toBe(422);
    const tooBig = await request(app)
      .put(link({ maxBytes: 10 }))
      .set('Content-Type', 'image/png')
      .send(PNG);
    expect(tooBig.status).toBe(422);
    await request(app)
      .put(link({ exp: Date.now() - 1 }))
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(403);
    const tampered = link().replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    await request(app).put(tampered).set('Content-Type', 'image/png').send(PNG).expect(403);

    await request(app).put(link()).set('Content-Type', 'image/png').send(PNG).expect(201);
    const again = await request(app).put(link()).set('Content-Type', 'image/png').send(PNG);
    expect(again.status).toBe(409);
  });

  it('only the batch trainer or an admin may request an upload link', async () => {
    const w = await world();
    const other = await createLoginUser(prisma(), Role.TRAINER);
    const body = {
      resultId: w.resultId,
      fileName: 'x.png',
      contentType: 'image/png',
      sizeBytes: 10,
    };
    await request(app)
      .post('/api/v1/evidence/upload-url')
      .set(await auth(other.email))
      .send(body)
      .expect(403);
    await request(app)
      .post('/api/v1/evidence/upload-url')
      .set(await auth(w.students[0]!.user.email))
      .send(body)
      .expect(403);
    await request(app).post('/api/v1/evidence/upload-url').set(w.A).send(body).expect(200);
  });
});

describe('attaching evidence (BRQ-18.1–18.3)', () => {
  it('attaches an uploaded photo with rubric scores and its competency; audited', async () => {
    const w = await world();
    await request(app)
      .put(`/api/v1/assessments/${w.assessment.id}/rubric`)
      .set(w.T)
      .send(rubric)
      .expect(200);

    const missing = await request(app)
      .post(`/api/v1/results/${w.resultId}/evidence`)
      .set(w.T)
      .send({ kind: 'FILE', key: `evidence/${w.resultId}/nothing.png`, fileName: 'x.png' });
    expect(missing.body.error.code).toBe('UPLOAD_NOT_FOUND');

    const key = await upload(w);
    const elsewhere = await request(app)
      .post(`/api/v1/results/${w.otherResultId}/evidence`)
      .set(w.T)
      .send({ kind: 'FILE', key, fileName: 'joint.png' });
    expect(elsewhere.body.error.code).toBe('INVALID_KEY');

    const res = await request(app)
      .post(`/api/v1/results/${w.resultId}/evidence`)
      .set(w.T)
      .send({
        kind: 'FILE',
        key,
        fileName: 'joint.png',
        competencyId: w.comp.id,
        scores: { safety: 3, finish: 2 },
        note: 'Clean bead',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      kind: 'FILE',
      fileName: 'joint.png',
      mime: 'image/png',
      sizeBytes: PNG.length,
      url: null,
      competency: { id: w.comp.id, code: 'JOINT' },
      scores: { safety: 3, finish: 2 },
      uploadedBy: w.trainer.fullName,
    });
    const logged = await prisma().auditLog.count({
      where: { entity: 'PracticalEvidence', entityId: res.body.id, action: 'EVIDENCE_ATTACHED' },
    });
    expect(logged).toBe(1);

    const dup = await request(app)
      .post(`/api/v1/results/${w.resultId}/evidence`)
      .set(w.T)
      .send({ kind: 'FILE', key, fileName: 'joint.png' });
    expect(dup.status).toBe(409);

    const sheet = await request(app)
      .get(`/api/v1/assessments/${w.assessment.id}/evidence`)
      .set(w.T)
      .expect(200);
    const row = sheet.body.rows.find((r: { resultId: string }) => r.resultId === w.resultId);
    expect(row.evidence).toHaveLength(1);
    expect(sheet.body.competencies.map((c: { code: string }) => c.code)).toEqual(['JOINT']);
  });

  it('videos are links only (https); a competency from another course is refused', async () => {
    const w = await world();
    const http = await request(app)
      .post(`/api/v1/results/${w.resultId}/evidence`)
      .set(w.T)
      .send({ kind: 'LINK', url: 'http://example.org/v/1' });
    expect(http.status).toBe(422);
    const elsewhere = await world();
    const wrong = await request(app)
      .post(`/api/v1/results/${w.resultId}/evidence`)
      .set(w.T)
      .send({ kind: 'LINK', url: 'https://example.org/v/1', competencyId: elsewhere.comp.id });
    expect(wrong.body.error.code).toBe('INVALID_COMPETENCY');
    const ok = await request(app)
      .post(`/api/v1/results/${w.resultId}/evidence`)
      .set(w.T)
      .send({ kind: 'LINK', url: 'https://example.org/v/1', competencyId: w.comp.id })
      .expect(201);
    expect(ok.body).toMatchObject({ kind: 'LINK', url: 'https://example.org/v/1' });
  });
});

describe('opening evidence (signed links) and the passport (BRQ-10.2)', () => {
  it('the student and staff get a short-lived link; others are refused; expired links fail', async () => {
    const w = await world();
    const key = await upload(w);
    const ev = (
      await request(app)
        .post(`/api/v1/results/${w.resultId}/evidence`)
        .set(w.T)
        .send({ kind: 'FILE', key, fileName: 'joint.png', competencyId: w.comp.id })
        .expect(201)
    ).body as { id: string };

    const S = await auth(w.students[0]!.user.email);
    const link = await request(app).get(`/api/v1/evidence/${ev.id}/url`).set(S).expect(200);
    const expiresIn = new Date(link.body.expiresAt).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(0);
    expect(expiresIn).toBeLessThanOrEqual(300_000);
    const file = await request(app).get(pathOf(link.body.url)).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);

    await request(app).get(`/api/v1/evidence/${ev.id}/url`).set(w.T).expect(200);
    const classmate = await auth(w.students[1]!.user.email);
    await request(app).get(`/api/v1/evidence/${ev.id}/url`).set(classmate).expect(403);

    const expired = signLocalGrant({ op: 'get', key, exp: Date.now() - 1 });
    await request(app).get(`/api/v1/files/${expired}`).expect(403);
    // An upload grant can't be used to read.
    const putGrant = signLocalGrant({ op: 'put', key, exp: Date.now() + 60_000 });
    await request(app).get(`/api/v1/files/${putGrant}`).expect(403);

    // The verified practical competency shows its evidence in the signed-in passport only.
    await request(app)
      .put(`/api/v1/batches/${w.batch.id}/competency-ratings`)
      .set(w.T)
      .send({
        ratings: [
          { studentId: w.students[0]!.studentId, competencyId: w.comp.id, level: 3, verify: true },
        ],
      })
      .expect(200);
    const passport = await request(app).get('/api/v1/students/me/passport').set(S).expect(200);
    expect(passport.body.practical[0].evidence).toEqual([
      { id: ev.id, kind: 'FILE', label: 'joint.png' },
    ]);
  });
});
