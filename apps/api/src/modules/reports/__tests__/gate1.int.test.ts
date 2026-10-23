import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../../app';
import { disconnectPrisma, prisma } from '../../../core/db';
import { createLoginUser, uid } from '../../../../test/fixtures';
import { bearer, login } from '../../../../test/http';

const app = createApp();
afterAll(() => disconnectPrisma());

const auth = async (email: string) => bearer((await login(app, email)).accessToken);
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const key = () => ({ 'Idempotency-Key': uid() });

/** Awaits a request and fails with its method, URL and body if the status is not the expected one. */
async function ok<T = Record<string, unknown>>(r: request.Test, status = 200): Promise<T> {
  const { method, url } = r as unknown as { method: string; url: string };
  const res = await r;
  if (res.status !== status) {
    throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as T;
}

/**
 * GATE 1 (Sprint 7): the whole Release 1 workflow through the API, then a check that every
 * attendance, marks, enrollment and completion change left an audit row (BR-12).
 */
describe('Gate 1: enrollment → certificate, fully audited', () => {
  it('runs the R1 workflow end to end and audits every change', async () => {
    const started = new Date();
    const db = prisma();
    const s = uid();
    const admin = await createLoginUser(db, Role.ADMIN);
    const trainer = await createLoginUser(db, Role.TRAINER);
    const student = await createLoginUser(db, Role.STUDENT);
    const A = await auth(admin.email);
    const T = await auth(trainer.email);
    const S = await auth(student.email);

    // Admin: cycle, course, open window (BRQ-2.1, 2.3), batch (BRQ-4.1).
    const cycle = await ok<{ id: string }>(
      request(app)
        .post('/api/v1/admin/cycles')
        .set(A)
        .send({ name: `Gate ${s}`, startsOn: day(-10), endsOn: day(60) }),
      201,
    );
    const course = await ok<{ id: string }>(
      request(app)
        .post('/api/v1/admin/courses')
        .set(A)
        .send({
          code: `G-${s}`.slice(0, 20),
          title: `Gate course ${s}`,
          description: 'End-to-end course',
          durationWeeks: 8,
          seatCapacity: 10,
        }),
      201,
    );
    await ok(
      request(app)
        .put(`/api/v1/admin/cycles/${cycle.id}/offerings/${course.id}`)
        .set(A)
        .send({
          enrollmentOpensAt: new Date(Date.now() - 3_600_000).toISOString(),
          enrollmentClosesAt: new Date(Date.now() + 86_400_000).toISOString(),
          isOpen: true,
        }),
    );
    const batch = await ok<{ id: string }>(
      request(app)
        .post('/api/v1/admin/batches')
        .set(A)
        .send({
          courseId: course.id,
          cycleId: cycle.id,
          name: 'Gate batch',
          capacity: 5,
          startDate: day(-5),
          endDate: day(50),
          venue: 'Workshop G',
        }),
      201,
    );

    // Student applies (BRQ-3.1); admin approves (BRQ-3.3); allocation preview → confirm (BRQ-4.2).
    const enrollment = await ok<{ id: string }>(
      request(app)
        .post('/api/v1/enrollments')
        .set(S)
        .set(key())
        .send({ cycleId: cycle.id, courseIds: [course.id] }),
      201,
    );
    await ok(
      request(app)
        .post(`/api/v1/admin/enrollments/${enrollment.id}/approve`)
        .set(A)
        .set(key())
        .send({}),
    );
    const preview = await ok<{ previewId: string; stats: { allocated: number } }>(
      request(app).post('/api/v1/admin/allocations/preview').set(A).send({ cycleId: cycle.id }),
    );
    expect(preview.stats.allocated).toBe(1);
    await ok(
      request(app)
        .post('/api/v1/admin/allocations/confirm')
        .set(A)
        .set(key())
        .send({ previewId: preview.previewId }),
    );

    // Trainer, two past sessions, activation (BRQ-4.3).
    await ok(
      request(app)
        .post(`/api/v1/admin/batches/${batch.id}/trainers`)
        .set(A)
        .send({ trainerId: trainer.trainer!.id }),
    );
    for (const offset of [-2, -1]) {
      const startsAt = new Date(Date.now() + offset * 86_400_000);
      await ok(
        request(app)
          .post(`/api/v1/admin/batches/${batch.id}/sessions`)
          .set(A)
          .send({
            kind: 'single',
            startsAt: startsAt.toISOString(),
            endsAt: new Date(startsAt.getTime() + 7_200_000).toISOString(),
          }),
        201,
      );
    }
    await ok(
      request(app).post(`/api/v1/admin/batches/${batch.id}/activate`).set(A).set(key()).send(),
    );

    // Trainer marks every session (BRQ-5.1), records marks (BRQ-6.1, 6.2) and evaluates (6.3).
    const sessions = await ok<Array<{ id: string }>>(
      request(app).get(`/api/v1/batches/${batch.id}/sessions`).set(T),
    );
    expect(sessions).toHaveLength(2);
    for (const session of sessions) {
      await ok(
        request(app)
          .put(`/api/v1/sessions/${session.id}/attendance`)
          .set(T)
          .send({ entries: [{ studentId: student.student!.id, status: 'PRESENT' }] }),
      );
    }
    const assessment = await ok<{ id: string }>(
      request(app).post(`/api/v1/batches/${batch.id}/assessments`).set(T).send({
        title: 'Final practical',
        mode: 'PRACTICAL',
        maxMarks: 50,
        weightage: 1,
        isMandatory: true,
      }),
      201,
    );
    await ok(
      request(app)
        .put(`/api/v1/assessments/${assessment.id}/results`)
        .set(T)
        .send({ results: [{ studentId: student.student!.id, marks: 44 }] }),
    );
    await ok(
      request(app)
        .put(`/api/v1/enrollments/${enrollment.id}/evaluation`)
        .set(T)
        .send({ remarks: 'Ready to work', recommended: true }),
    );

    // Admin approves completion (BRQ-7.1, 7.2); the student downloads certificate and report.
    const approved = await ok<{ status: string; certificate: { id: string } }>(
      request(app).post(`/api/v1/completions/${enrollment.id}/approve`).set(A).set(key()).send(),
      201,
    );
    expect(approved.status).toBe('CERTIFIED');
    const certificateId = approved.certificate.id;
    const pdf = await request(app).get(`/api/v1/certificates/${certificateId}/download`).set(S);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const report = await request(app).get('/api/v1/reports/students/me.pdf').set(S);
    expect(report.status).toBe(200);
    expect(report.headers['content-type']).toBe('application/pdf');

    // BR-12: every change above left its audit row.
    const rows = await db.auditLog.findMany({
      where: {
        createdAt: { gte: started },
        OR: [
          { entityId: enrollment.id },
          { entityId: certificateId },
          { entityId: { endsWith: `:${student.student!.id}` } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { action: true, userId: true },
    });
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'ENROLLMENT_SUBMITTED',
        'ENROLLMENT_APPROVED',
        'ENROLLMENT_ALLOCATED',
        'ENROLLMENT_ACTIVE',
        'ATTENDANCE_MARKED',
        'RESULT_RECORDED',
        'EVALUATION_RECORDED',
        'ENROLLMENT_COMPLETED',
        'CERTIFICATE_ISSUED',
        'CERTIFICATE_RENDERED',
        'ENROLLMENT_CERTIFIED',
      ]),
    );
    expect(actions.filter((a) => a === 'ATTENDANCE_MARKED')).toHaveLength(2);
    // Every row names who did it (system rows would have a null user; none here).
    expect(rows.every((r) => r.userId !== null)).toBe(true);
    expect(await db.performanceReport.count({ where: { enrollmentId: enrollment.id } })).toBe(1);
  });
});
