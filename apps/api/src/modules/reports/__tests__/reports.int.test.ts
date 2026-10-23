import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../../app';
import { disconnectPrisma, prisma } from '../../../core/db';
import { createLoginUser, createTrainedBatch, uid } from '../../../../test/fixtures';
import { bearer, login } from '../../../../test/http';

const app = createApp();
afterAll(() => disconnectPrisma());
const auth = async (email: string) => bearer((await login(app, email)).accessToken);

const binary = (r: request.Test) =>
  r.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

/** Drops the UTF-8 BOM (U+FEFF) the CSV starts with, then splits into lines. */
const csvLines = (text: string) =>
  (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trim().split('\r\n');

/** Two students: the first certified (4/4, 45/50), the second still in training (1/4, no marks). */
async function world() {
  const db = prisma();
  const w = await createTrainedBatch(db, [
    { attended: 4, marks: 45, recommended: true },
    { attended: 1 },
  ]);
  const admin = await createLoginUser(db, Role.ADMIN);
  const adminAuth = await auth(admin.email);
  const approved = await request(app)
    .post(`/api/v1/completions/${w.students[0]!.enrollmentId}/approve`)
    .set(adminAuth)
    .set('Idempotency-Key', uid())
    .send();
  expect(approved.status).toBe(201);
  return { ...w, adminAuth, code: approved.body.certificate.publicCode as string };
}

describe('student performance report (BRQ-8.1)', () => {
  it('the student and admins get the PDF and a snapshot is kept; others are refused', async () => {
    const w = await world();
    const [first, second] = w.students;
    const own = await binary(
      request(app)
        .get('/api/v1/reports/students/me.pdf')
        .set(await auth(first!.user.email)),
    );
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toBe('application/pdf');
    expect(own.headers['content-disposition']).toBe(
      `attachment; filename="performance-report-${first!.user.student!.rollNo.toLowerCase()}.pdf"`,
    );
    expect((own.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const snap = await prisma().performanceReport.findFirstOrThrow({
      where: { enrollmentId: first!.enrollmentId },
    });
    expect(snap.snapshot).toMatchObject({
      status: 'Certified',
      attendance: { attended: 4, conducted: 4, percent: 100 },
      aggregate: 90,
      grade: 'A',
      gradeIsFinal: true,
      certificateCode: w.code,
    });

    const url = `/api/v1/reports/students/${first!.studentId}.pdf`;
    expect((await request(app).get(url).set(w.adminAuth)).status).toBe(200);
    expect(
      (
        await request(app)
          .get(url)
          .set(await auth(second!.user.email))
      ).status,
    ).toBe(403);
    // BRD §12.2: the student report is for the student and admins, not trainers.
    expect(
      (
        await request(app)
          .get(url)
          .set(await auth(w.trainer.email))
      ).status,
    ).toBe(403);

    const nobody = await createLoginUser(prisma(), Role.STUDENT);
    const none = await request(app)
      .get('/api/v1/reports/students/me.pdf')
      .set(await auth(nobody.email));
    expect(none.status).toBe(404);
  });
});

describe('batch and course reports (BRQ-8.2)', () => {
  it('batch CSV has attendance, marks, status and certificate per student; trainer or admin only', async () => {
    const w = await world();
    const trainerAuth = await auth(w.trainer.email);
    const res = await request(app)
      .get(`/api/v1/reports/batches/${w.batch.id}`)
      .query({ format: 'csv' })
      .set(trainerAuth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    const [header, ...rows] = csvLines(res.text);
    expect(header).toBe(
      'Roll no,Name,Status,Sessions attended,Sessions conducted,Attendance %,Final practical (/50),Aggregate %,Grade,Certificate ID',
    );
    const [first, second] = w.students;
    expect(rows).toContain(
      `${first!.user.student!.rollNo},${first!.user.fullName},Certified,4,4,100,45,90,A,${w.code}`,
    );
    expect(rows).toContain(
      `${second!.user.student!.rollNo},${second!.user.fullName},In training,1,4,25,,,,`,
    );

    const pdf = await binary(
      request(app)
        .get(`/api/v1/reports/batches/${w.batch.id}`)
        .query({ format: 'pdf' })
        .set(w.adminAuth),
    );
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const stranger = await createLoginUser(prisma(), Role.TRAINER);
    const get = async (email: string) =>
      (
        await request(app)
          .get(`/api/v1/reports/batches/${w.batch.id}`)
          .set(await auth(email))
      ).status;
    expect(await get(stranger.email)).toBe(403);
    expect(await get(first!.user.email)).toBe(403);
    expect(
      (
        await request(app)
          .get(`/api/v1/reports/batches/${w.batch.id}`)
          .query({ format: 'xlsx' })
          .set(trainerAuth)
      ).status,
    ).toBe(422);
  });

  it('course CSV has completion rate and grade distribution per batch; admin only', async () => {
    const w = await world();
    const res = await request(app)
      .get(`/api/v1/reports/courses/${w.course.id}`)
      .query({ format: 'csv' })
      .set(w.adminAuth);
    expect(res.status).toBe(200);
    const lines = csvLines(res.text);
    expect(lines[0]).toBe(
      'Cycle,Batch,Batch status,Students,In training,Completed,Not completed,Completion rate %,Grade A,Grade B,Grade C,Grade D',
    );
    // One certified (A), one in training: the rate counts only those who finished → 100 %.
    expect(lines[1]).toBe(`${w.cycle.name},${w.batch.name},ACTIVE,2,1,1,0,100,1,0,0,0`);
    expect(lines[2]).toBe('All batches,,,2,1,1,0,100,1,0,0,0');

    const pdf = await binary(
      request(app)
        .get(`/api/v1/reports/courses/${w.course.id}`)
        .query({ format: 'pdf' })
        .set(w.adminAuth),
    );
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    expect(
      (
        await request(app)
          .get(`/api/v1/reports/courses/${w.course.id}`)
          .set(await auth(w.trainer.email))
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get('/api/v1/reports/courses/00000000-0000-4000-8000-000000000000')
          .set(w.adminAuth)
      ).status,
    ).toBe(404);
  });
});
