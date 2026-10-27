import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../app';
import { disconnectPrisma, prisma } from '../core/db';
import {
  createApprovedApplicants,
  createBatch,
  createLoginUser,
  createOpenCycle,
  createTrainedBatch,
  uid,
} from '../../test/fixtures';
import { bearer, login } from '../../test/http';

const app = createApp();
let admin: Record<string, string>;

beforeAll(async () => {
  const user = await createLoginUser(prisma(), Role.ADMIN);
  admin = bearer((await login(app, user.email)).accessToken);
});
afterAll(() => disconnectPrisma());

/**
 * Makes the database refuse the audit row for `action` (a trigger that raises), so the failure
 * happens after the transaction has already changed statuses and inserted rows. Integration
 * suites run one at a time, so the trigger never reaches another suite; it is always dropped.
 */
async function failingAudit<T>(action: string, fn: () => Promise<T>): Promise<T> {
  const db = prisma();
  await db.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION test_fail_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW.action = TG_ARGV[0] THEN RAISE EXCEPTION 'forced failure for %', NEW.action; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`);
  await db.$executeRawUnsafe(`
    CREATE TRIGGER test_fail_audit BEFORE INSERT ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION test_fail_audit('${action}')`);
  try {
    return await fn();
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_fail_audit ON audit_logs');
  }
}

describe('a failure mid-transaction commits nothing (NFR-05)', () => {
  it('completion approval: no status change, certificate, audit row or notification survives', async () => {
    const w = await createTrainedBatch(prisma(), [{ attended: 4, marks: 45, recommended: true }]);
    const { enrollmentId, user } = w.students[0]!;

    // The certificate's audit row is written after the status change and the certificate row.
    const res = await failingAudit('CERTIFICATE_ISSUED', () =>
      request(app)
        .post(`/api/v1/completions/${enrollmentId}/approve`)
        .set(admin)
        .set('Idempotency-Key', uid())
        .send(),
    );
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');

    const db = prisma();
    expect((await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).status).toBe(
      'ACTIVE',
    );
    expect(await db.certificate.count({ where: { enrollmentId } })).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: enrollmentId } })).toBe(0);
    expect(
      await db.notification.count({ where: { userId: user.id, type: 'TRAINING_COMPLETED' } }),
    ).toBe(0);

    // Once the fault is gone, the same approval goes through.
    const retry = await request(app)
      .post(`/api/v1/completions/${enrollmentId}/approve`)
      .set(admin)
      .set('Idempotency-Key', uid())
      .send();
    expect(retry.status).toBe(201);
    expect(await db.certificate.count({ where: { enrollmentId } })).toBe(1);
  });

  it('allocation confirm: no memberships or status changes, and the preview can still be confirmed', async () => {
    const db = prisma();
    const { cycle, courses } = await createOpenCycle(db, 1);
    const batch = await createBatch(db, cycle.id, courses[0]!.id, 2);
    const ids = await createApprovedApplicants(db, cycle.id, [
      [courses[0]!.id],
      [courses[0]!.id],
      [courses[0]!.id],
    ]);
    const p = await request(app)
      .post('/api/v1/admin/allocations/preview')
      .set(admin)
      .send({ cycleId: cycle.id })
      .expect(200);

    // ALLOCATION_CONFIRMED is the last write, after memberships and every status change.
    const res = await failingAudit('ALLOCATION_CONFIRMED', () =>
      request(app)
        .post('/api/v1/admin/allocations/confirm')
        .set(admin)
        .send({ previewId: p.body.previewId }),
    );
    expect(res.status).toBe(500);

    expect(await db.batchStudent.count({ where: { batchId: batch.id } })).toBe(0);
    expect(await db.enrollment.count({ where: { id: { in: ids }, status: 'APPROVED' } })).toBe(3);
    expect(await db.auditLog.count({ where: { entityId: { in: ids } } })).toBe(0);
    expect(
      (await db.allocationPreview.findUniqueOrThrow({ where: { id: p.body.previewId } }))
        .confirmedAt,
    ).toBeNull();

    const retry = await request(app)
      .post('/api/v1/admin/allocations/confirm')
      .set(admin)
      .send({ previewId: p.body.previewId });
    expect(retry.status).toBe(200);
    expect(await db.batchStudent.count({ where: { batchId: batch.id } })).toBe(2);
  });
});
