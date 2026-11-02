import { EnrollmentStatus, Prisma, type PrismaClient } from '@prisma/client';
import { audit } from '../core/audit';
import { EMAIL_DOMAIN } from './data';
import { DEFAULT_STUDENTS } from './index';

/** Before 2026-10-30 the default seed made 60 students; it now makes DEFAULT_STUDENTS (40). */
export const OLD_DEFAULT_STUDENTS = 60;

const BY = 'seed --remove-old-students';

export interface RemoveOldStudentsResult {
  deleted: string[];
  deactivated: string[];
}

/** The seeded students the old default made and the current one doesn't (041–060). */
export function oldStudentEmails(): string[] {
  const emails: string[] = [];
  for (let n = DEFAULT_STUDENTS + 1; n <= OLD_DEFAULT_STUDENTS; n++) {
    emails.push(`student${String(n).padStart(3, '0')}@${EMAIL_DOMAIN}`);
  }
  return emails;
}

const isForeignKeyError = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003';

/**
 * Removes the seeded students 041–060 that a database seeded before the names were made unique
 * still holds. A student whose only records are pending applications (as the old seed left
 * them) is deleted with those applications. One with anything more (an admin decision, a
 * batch, marks, their own actions in the audit log) keeps the record and is deactivated
 * instead, like the admin's safe delete (BRQ-2.5). Each change is audited in its own
 * transaction. Accounts with real emails, and students 001–040, are never touched.
 */
export async function removeOldSeedStudents(
  prisma: PrismaClient,
  log: (message: string) => void = () => undefined,
  emails: string[] = oldStudentEmails(),
): Promise<RemoveOldStudentsResult> {
  const result: RemoveOldStudentsResult = { deleted: [], deactivated: [] };
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    orderBy: { email: 'asc' },
    select: {
      id: true,
      email: true,
      fullName: true,
      isActive: true,
      student: {
        select: {
          id: true,
          rollNo: true,
          enrollments: { select: { id: true, status: true } },
        },
      },
    },
  });

  for (const u of users) {
    const enrollments = u.student?.enrollments ?? [];
    const onlyPending = enrollments.every((e) => e.status === EnrollmentStatus.PENDING);
    if (onlyPending) {
      try {
        await prisma.$transaction(async (tx) => {
          // Preferences go with their application (ON DELETE CASCADE).
          await tx.enrollment.deleteMany({ where: { id: { in: enrollments.map((e) => e.id) } } });
          await tx.student.deleteMany({ where: { userId: u.id } });
          // Sessions and notifications go with the account (ON DELETE CASCADE).
          await tx.user.delete({ where: { id: u.id } });
          await audit.record(tx, {
            userId: null,
            action: 'USER_DELETED',
            entity: 'User',
            entityId: u.id,
            oldValue: {
              email: u.email,
              fullName: u.fullName,
              role: 'STUDENT',
              rollNo: u.student?.rollNo ?? null,
              pendingApplications: enrollments.length,
            },
            newValue: { by: BY },
          });
        });
        result.deleted.push(u.email);
        continue;
      } catch (err) {
        // Something else still points at the account: keep it and deactivate below.
        if (!isForeignKeyError(err)) throw err;
      }
    }
    if (!u.isActive) continue;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { isActive: false } });
      await tx.refreshToken.updateMany({
        where: { userId: u.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await audit.record(tx, {
        userId: null,
        action: 'USER_DEACTIVATED',
        entity: 'User',
        entityId: u.id,
        oldValue: { isActive: true },
        newValue: { isActive: false, by: BY },
      });
    });
    result.deactivated.push(u.email);
  }

  log(
    `old students 0${DEFAULT_STUDENTS + 1}–0${OLD_DEFAULT_STUDENTS}: ${result.deleted.length} deleted, ` +
      `${result.deactivated.length} deactivated (they have records), ` +
      `${users.length - result.deleted.length - result.deactivated.length} already inactive, ` +
      `${emails.length - users.length} not present`,
  );
  return result;
}
