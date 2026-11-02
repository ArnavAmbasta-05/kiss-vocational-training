import { EnrollmentStatus, Role } from '@prisma/client';
import { disconnectPrisma, prisma } from '../../core/db';
import { createLoginUser, createOpenCycle } from '../../../test/fixtures';
import { oldStudentEmails, removeOldSeedStudents } from '../removeOldStudents';

afterAll(() => disconnectPrisma());

describe('seed --remove-old-students (BRQ-2.5)', () => {
  it('names students 041–060 only', () => {
    const emails = oldStudentEmails();
    expect(emails).toHaveLength(20);
    expect(emails[0]).toBe('student041@kiss-vtmp.test');
    expect(emails[19]).toBe('student060@kiss-vtmp.test');
  });

  it('deletes a student with only pending applications; deactivates one with records', async () => {
    const db = prisma();
    const { cycle, courses } = await createOpenCycle(db, 1);
    const apply = (studentId: string, status: EnrollmentStatus) =>
      db.enrollment.create({
        data: {
          studentId,
          cycleId: cycle.id,
          status,
          preferences: { create: { courseId: courses[0]!.id, rank: 1 } },
        },
      });

    const pendingOnly = await createLoginUser(db, Role.STUDENT);
    await apply(pendingOnly.student!.id, EnrollmentStatus.PENDING);
    const approved = await createLoginUser(db, Role.STUDENT);
    await apply(approved.student!.id, EnrollmentStatus.APPROVED);
    // Their own action in the audit log keeps the account (the log is insert-only).
    const acted = await createLoginUser(db, Role.STUDENT);
    await apply(acted.student!.id, EnrollmentStatus.PENDING);
    await db.auditLog.create({
      data: {
        userId: acted.id,
        action: 'ENROLLMENT_SUBMITTED',
        entity: 'Enrollment',
        entityId: acted.id,
      },
    });
    const untouched = await createLoginUser(db, Role.STUDENT);

    const result = await removeOldSeedStudents(db, undefined, [
      pendingOnly.email,
      approved.email,
      acted.email,
    ]);
    expect(result.deleted).toEqual([pendingOnly.email]);
    expect(result.deactivated.sort()).toEqual([approved.email, acted.email].sort());

    expect(await db.user.findUnique({ where: { id: pendingOnly.id } })).toBeNull();
    expect(await db.enrollment.count({ where: { studentId: pendingOnly.student!.id } })).toBe(0);
    expect(
      await db.auditLog.findFirst({
        where: { action: 'USER_DELETED', entityId: pendingOnly.id },
      }),
    ).toMatchObject({ userId: null, newValue: { by: 'seed --remove-old-students' } });

    for (const u of [approved, acted]) {
      const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(after.isActive).toBe(false);
      expect(await db.enrollment.count({ where: { studentId: u.student!.id } })).toBe(1);
    }
    expect((await db.user.findUniqueOrThrow({ where: { id: untouched.id } })).isActive).toBe(true);

    // Running it again changes nothing.
    const again = await removeOldSeedStudents(db, undefined, [
      pendingOnly.email,
      approved.email,
      acted.email,
    ]);
    expect(again).toEqual({ deleted: [], deactivated: [] });
  });
});
