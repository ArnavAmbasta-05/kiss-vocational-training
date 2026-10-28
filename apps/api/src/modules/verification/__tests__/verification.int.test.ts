import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../../app';
import { disconnectPrisma, prisma } from '../../../core/db';
import { createLoginUser, createTrainedBatch, uid } from '../../../../test/fixtures';
import { bearer, login } from '../../../../test/http';

const app = createApp();
afterAll(() => disconnectPrisma());
const auth = async (email: string) => bearer((await login(app, email)).accessToken);

/**
 * A certified student (4/4 sessions, 45/50, recommended) with one PRACTICAL and one THEORY
 * competency verified by the batch trainer, and a second student in the same batch.
 */
async function world() {
  const db = prisma();
  const w = await createTrainedBatch(db, [
    { attended: 4, marks: 45, recommended: true },
    { attended: 2 },
  ]);
  const admin = await createLoginUser(db, Role.ADMIN);
  const A = await auth(admin.email);
  const T = await auth(w.trainer.email);
  const mk = async (code: string, mode: 'PRACTICAL' | 'THEORY') =>
    (
      await request(app)
        .post(`/api/v1/courses/${w.course.id}/competencies`)
        .set(A)
        .send({ code, title: `${mode} skill ${code}`, mode, requiredLevel: 3, isMandatory: true })
        .expect(201)
    ).body as { id: string };
  const practical = await mk('P1', 'PRACTICAL');
  const theory = await mk('T1', 'THEORY');
  const s = w.students[0]!;
  await request(app)
    .put(`/api/v1/batches/${w.batch.id}/competency-ratings`)
    .set(T)
    .send({
      ratings: [
        { studentId: s.studentId, competencyId: practical.id, level: 4, verify: true },
        { studentId: s.studentId, competencyId: theory.id, level: 3, verify: true },
      ],
    })
    .expect(200);
  const approved = await request(app)
    .post(`/api/v1/completions/${s.enrollmentId}/approve`)
    .set(A)
    .set('Idempotency-Key', uid())
    .send()
    .expect(201);
  return {
    ...w,
    A,
    T,
    S: await auth(s.user.email),
    practical,
    theory,
    cert: approved.body.certificate as { id: string; publicCode: string },
  };
}

const verify = (code: string) => request(app).get(`/api/v1/public/verify/${code}`);

describe('public certificate verification (F15, BRQ-15.2–15.5)', () => {
  it('valid code → only name, course, grade, issue date and status; counts the lookup', async () => {
    const w = await world();
    const res = await verify(w.cert.publicCode);
    expect(res.status).toBe(200);
    // BR-15: pin the exact keys so nothing else (marks, attendance, contact) can leak.
    expect(Object.keys(res.body).sort()).toEqual([
      'course',
      'grade',
      'issueDate',
      'name',
      'revokedOn',
      'status',
    ]);
    expect(res.body).toMatchObject({
      name: w.students[0]!.user.fullName,
      course: w.course.title,
      grade: 'A',
      status: 'VALID',
      revokedOn: null,
    });
    const own = await prisma().student.findUniqueOrThrow({
      where: { id: w.students[0]!.studentId },
    });
    for (const value of [w.students[0]!.user.email, own.rollNo]) {
      expect(JSON.stringify(res.body)).not.toContain(value);
    }
    expect(res.headers['cache-control']).toBe('no-cache');
    // Lower-case input is accepted too; the count rises in the background.
    await verify(w.cert.publicCode.toLowerCase()).expect(200);
    await new Promise((r) => setTimeout(r, 200));
    const c = await prisma().certificate.findUniqueOrThrow({ where: { id: w.cert.id } });
    expect(c.verificationCount).toBe(2);
  });

  it('TC-18: unknown or malformed codes → 404 "Certificate not found"', async () => {
    const unknown = await verify('ZZZZZZZZZZZZZZZZ');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toEqual({
      code: 'CERTIFICATE_NOT_FOUND',
      message: 'Certificate not found',
    });
    expect((await verify('x')).status).toBe(404);
    expect((await verify('%3Cscript%3E')).status).toBe(404);
  });

  it('revoked → REVOKED with the date and never the reason; admin only', async () => {
    const w = await world();
    const reason = 'Issued in error after a data-entry mistake';
    for (const who of [w.S, w.T]) {
      expect(
        (
          await request(app)
            .post(`/api/v1/certificates/${w.cert.id}/revoke`)
            .set(who)
            .send({ reason })
        ).status,
      ).toBe(403);
    }
    const revoked = await request(app)
      .post(`/api/v1/certificates/${w.cert.id}/revoke`)
      .set(w.A)
      .send({ reason });
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe('REVOKED');

    const res = await verify(w.cert.publicCode);
    expect(res.body.status).toBe('REVOKED');
    expect(res.body.revokedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.stringify(res.body)).not.toContain('data-entry');

    const again = await request(app)
      .post(`/api/v1/certificates/${w.cert.id}/revoke`)
      .set(w.A)
      .send({ reason });
    expect(again.status).toBe(409);
    expect(
      await prisma().auditLog.count({
        where: { entity: 'Certificate', entityId: w.cert.id, action: 'CERTIFICATE_REVOKED' },
      }),
    ).toBe(1);
  });

  it('reissue → new code VALID, old SUPERSEDED and linked; the enrollment stays certified', async () => {
    const w = await world();
    const res = await request(app).post(`/api/v1/certificates/${w.cert.id}/reissue`).set(w.A);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'VALID', rendered: true, grade: 'A' });
    expect(res.body.publicCode).not.toBe(w.cert.publicCode);

    const old = await prisma().certificate.findUniqueOrThrow({ where: { id: w.cert.id } });
    expect(old).toMatchObject({ status: 'SUPERSEDED', supersededById: res.body.id });
    expect((await verify(w.cert.publicCode)).body.status).toBe('SUPERSEDED');
    expect((await verify(res.body.publicCode)).body.status).toBe('VALID');
    const e = await prisma().enrollment.findUniqueOrThrow({
      where: { id: w.students[0]!.enrollmentId },
    });
    expect(e.status).toBe('CERTIFIED');
  });

  it('reissue after revoke (BR-19) → new VALID code, the old code stays REVOKED; only once', async () => {
    const w = await world();
    const path = `/api/v1/certificates/${w.cert.id}`;
    await request(app).post(`${path}/revoke`).set(w.A).send({ reason: 'Name misspelt' });
    const listed = await request(app).get(`/api/v1/certificates`).set(w.A);
    expect(listed.body.data.find((c: { id: string }) => c.id === w.cert.id).canReissue).toBe(true);

    const res = await request(app).post(`${path}/reissue`).set(w.A);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'VALID', grade: 'A', canReissue: true });
    expect(res.body.publicCode).not.toBe(w.cert.publicCode);
    const old = await prisma().certificate.findUniqueOrThrow({ where: { id: w.cert.id } });
    expect(old).toMatchObject({ status: 'REVOKED', supersededById: res.body.id });
    expect((await verify(w.cert.publicCode)).body.status).toBe('REVOKED');
    expect((await verify(res.body.publicCode)).body.status).toBe('VALID');
    expect(
      await prisma().auditLog.count({
        where: { entity: 'Certificate', entityId: w.cert.id, action: 'CERTIFICATE_REPLACED' },
      }),
    ).toBe(1);

    // The revoked one is replaced now: a second reissue of it is refused.
    const again = await request(app).post(`${path}/reissue`).set(w.A);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CERTIFICATE_NOT_REISSUABLE');
  });

  it('BRQ-15.5: the 31st request in a minute from one IP gets 429', async () => {
    // A fresh app has its own in-memory limiter, so earlier tests don't count.
    const fresh = createApp();
    for (let i = 0; i < 30; i++) {
      expect((await request(fresh).get('/api/v1/public/verify/ZZZZZZZZZZZZZZZZ')).status).toBe(404);
    }
    const blocked = await request(fresh).get('/api/v1/public/verify/ZZZZZZZZZZZZZZZZ');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('Skill Passport (F10, BRQ-10.1–10.4, BR-14)', () => {
  it('lists verified competencies, practical apart from theory, and certificates', async () => {
    const w = await world();
    const res = await request(app).get('/api/v1/students/me/passport').set(w.S);
    expect(res.status).toBe(200);
    expect(res.body.practical).toEqual([
      expect.objectContaining({
        code: 'P1',
        level: 4,
        courseTitle: w.course.title,
        verifiedBy: w.trainer.fullName,
      }),
    ]);
    expect(res.body.theory).toEqual([expect.objectContaining({ code: 'T1', level: 3 })]);
    expect(res.body.certificates).toEqual([
      expect.objectContaining({ publicCode: w.cert.publicCode, status: 'VALID', grade: 'A' }),
    ]);

    // The batch trainer may read it; another student may not.
    const id = w.students[0]!.studentId;
    expect((await request(app).get(`/api/v1/students/${id}/passport`).set(w.T)).status).toBe(200);
    const other = await auth(w.students[1]!.user.email);
    expect((await request(app).get(`/api/v1/students/${id}/passport`).set(other)).status).toBe(403);

    const pdf = await request(app).get('/api/v1/students/me/passport.pdf').set(w.S);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
  });

  it('admin revokes a verified competency with a reason; it leaves the passport but stays on record', async () => {
    const w = await world();
    const passport = (await request(app).get('/api/v1/students/me/passport').set(w.S)).body;
    const ratingId = passport.practical[0].ratingId as string;
    expect(
      (
        await request(app)
          .post(`/api/v1/competency-ratings/${ratingId}/revoke`)
          .set(w.T)
          .send({ reason: 'Wrong student' })
      ).status,
    ).toBe(403);
    await request(app)
      .post(`/api/v1/competency-ratings/${ratingId}/revoke`)
      .set(w.A)
      .send({ reason: 'Verified for the wrong student' })
      .expect(200);
    const after = (await request(app).get('/api/v1/students/me/passport').set(w.S)).body;
    expect(after.practical).toEqual([]);
    expect(after.revoked).toEqual([
      expect.objectContaining({ code: 'P1', revokedReason: 'Verified for the wrong student' }),
    ]);
    expect(await prisma().competencyRating.count({ where: { id: ratingId } })).toBe(1);
  });
});

describe('share links (BRQ-10.3, BR-15)', () => {
  it('a link shows whitelisted fields only; revoked or expired → 410; unknown → 404', async () => {
    const w = await world();
    const created = await request(app)
      .post('/api/v1/students/me/passport/shares')
      .set(w.S)
      .send({ expiresInDays: 7 });
    expect(created.status).toBe(201);
    const { token, url, id } = created.body as { token: string; url: string; id: string };
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url).toMatch(new RegExp(`/p/${token}$`));
    // Stored hashed: the database never holds the token itself.
    const row = await prisma().passportShare.findUniqueOrThrow({ where: { id } });
    expect(row.tokenHash).not.toContain(token);

    const view = await request(app).get(`/api/v1/public/passport/${token}`);
    expect(view.status).toBe(200);
    expect(Object.keys(view.body).sort()).toEqual([
      'certificates',
      'fullName',
      'photoUrl',
      'practical',
      'theory',
    ]);
    expect(Object.keys(view.body.practical[0]).sort()).toEqual([
      'courseTitle',
      'level',
      'title',
      'verifiedAt',
    ]);
    expect(Object.keys(view.body.certificates[0]).sort()).toEqual([
      'courseTitle',
      'grade',
      'issuedAt',
      'publicCode',
    ]);
    const text = JSON.stringify(view.body);
    for (const forbidden of ['marks', 'attendance', 'email', 'phone', 'rollNo', 'aggregate']) {
      expect(text).not.toContain(forbidden);
    }
    // Values too, not only key names: no contact details or roll number anywhere.
    const own = await prisma().student.findUniqueOrThrow({
      where: { id: w.students[0]!.studentId },
    });
    for (const value of [w.students[0]!.user.email, own.rollNo]) {
      expect(text).not.toContain(value);
    }

    // Only its owner can revoke it.
    const other = await auth(w.students[1]!.user.email);
    expect((await request(app).delete(`/api/v1/passport/shares/${id}`).set(other)).status).toBe(
      403,
    );
    await request(app).delete(`/api/v1/passport/shares/${id}`).set(w.S).expect(200);
    const gone = await request(app).get(`/api/v1/public/passport/${token}`);
    expect(gone.status).toBe(410);
    expect(gone.body.error).toEqual({ code: 'LINK_INACTIVE', message: 'Link no longer active' });

    // An expired link answers the same way.
    const second = await request(app).post('/api/v1/students/me/passport/shares').set(w.S).send({});
    await prisma().passportShare.update({
      where: { id: second.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await request(app).get(`/api/v1/public/passport/${second.body.token}`)).status).toBe(
      410,
    );

    expect((await request(app).get(`/api/v1/public/passport/${'a'.repeat(43)}`)).status).toBe(404);
    const list = await request(app).get('/api/v1/students/me/passport/shares').set(w.S);
    expect(list.body.map((s: { active: boolean }) => s.active)).toEqual([false, false]);
    expect(
      (
        await request(app)
          .post('/api/v1/students/me/passport/shares')
          .set(w.S)
          .send({ expiresInDays: 400 })
      ).status,
    ).toBe(422);
  });
});
