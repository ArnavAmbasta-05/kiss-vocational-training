import { Prisma } from '@prisma/client';
import type {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  ChangePasswordInput,
  Me,
  Paginated,
  UpdateProfileInput,
  UserListQuery,
  UserSummary,
} from '@vtmp/shared';
import { hashPassword, verifyPassword } from '../../core/auth';
import { withAudit, type Actor } from '../../core/audit';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';
import { paginated, parsePagination } from '../../core/http';
import { getMe, revokeUserSessions } from '../auth/auth.service';

// ─── Self-service (BRQ-1.3) ──────────────────────────────────────────────────

export async function updateProfile(
  actor: Actor & { userId: string },
  input: UpdateProfileInput,
): Promise<Me> {
  const userId = actor.userId;
  await withAudit(actor, async (tx, log) => {
    const before = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        fullName: true,
        locale: true,
        student: { select: { id: true, phone: true, nameOdia: true } },
        trainer: { select: { id: true, phone: true } },
      },
    });
    const { phone, nameOdia, ...userFields } = input;
    if (nameOdia !== undefined && !before.student) {
      throw AppError.unprocessable('STUDENTS_ONLY', 'Only students have an Odia name', [
        { path: 'nameOdia', message: 'Students only' },
      ]);
    }
    if (Object.keys(userFields).length) {
      await tx.user.update({ where: { id: userId }, data: userFields });
    }
    if (nameOdia !== undefined && before.student) {
      await tx.student.update({
        where: { id: before.student.id },
        data: { nameOdia: nameOdia || null },
      });
    }
    if (phone !== undefined) {
      if (before.student)
        await tx.student.update({ where: { id: before.student.id }, data: { phone } });
      else if (before.trainer)
        await tx.trainer.update({ where: { id: before.trainer.id }, data: { phone } });
    }
    await log({
      action: 'USER_PROFILE_UPDATED',
      entity: 'User',
      entityId: userId,
      oldValue: {
        fullName: before.fullName,
        locale: before.locale,
        phone: before.student?.phone ?? before.trainer?.phone ?? null,
        ...(before.student ? { nameOdia: before.student.nameOdia } : {}),
      },
      newValue: input,
    });
  });
  return getMe(userId);
}

export async function changePassword(
  actor: Actor & { userId: string },
  input: ChangePasswordInput,
  currentRefreshToken?: string,
): Promise<void> {
  const user = await prisma().user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { passwordHash: true },
  });
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw AppError.unprocessable('INVALID_CURRENT_PASSWORD', 'Current password is incorrect', [
      { path: 'currentPassword', message: 'Current password is incorrect' },
    ]);
  }
  const passwordHash = await hashPassword(input.newPassword);
  await withAudit(actor, async (tx, log) => {
    await tx.user.update({ where: { id: actor.userId }, data: { passwordHash } });
    // Sign out every other device; keep the session that made the change.
    await revokeUserSessions(tx, actor.userId, currentRefreshToken);
    // Never put password material in the audit log.
    await log({ action: 'USER_PASSWORD_CHANGED', entity: 'User', entityId: actor.userId });
  });
}

// ─── Admin user management ───────────────────────────────────────────────────

const summarySelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  locale: true,
  isActive: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
  student: { select: { rollNo: true } },
  trainer: { select: { employeeCode: true } },
} satisfies Prisma.UserSelect;

type SummaryRow = Prisma.UserGetPayload<{ select: typeof summarySelect }>;

function toSummary(u: SummaryRow): UserSummary {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    locale: u.locale,
    isActive: u.isActive,
    lockedUntil: u.lockedUntil?.toISOString() ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    rollNo: u.student?.rollNo ?? null,
    employeeCode: u.trainer?.employeeCode ?? null,
  };
}

export async function listUsers(query: UserListQuery): Promise<Paginated<UserSummary>> {
  const page = parsePagination(query);
  const q = query.q;
  const where: Prisma.UserWhereInput = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { fullName: { contains: q, mode: 'insensitive' } },
            { student: { rollNo: { contains: q, mode: 'insensitive' } } },
            { trainer: { employeeCode: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await prisma().$transaction([
    prisma().user.findMany({
      where,
      select: summarySelect,
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
      skip: page.skip,
      take: page.take,
    }),
    prisma().user.count({ where }),
  ]);
  return paginated(rows.map(toSummary), total, page);
}

function conflictFromUnique(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = String((err.meta?.target as string[] | string | undefined) ?? '');
    if (target.includes('roll_no'))
      throw AppError.conflict('ROLL_NO_TAKEN', 'Roll number is already in use');
    if (target.includes('employee_code'))
      throw AppError.conflict('EMPLOYEE_CODE_TAKEN', 'Employee code is already in use');
    throw AppError.conflict('EMAIL_TAKEN', 'An account with this email already exists');
  }
  throw err;
}

export async function createUser(actor: Actor, input: AdminCreateUserInput): Promise<UserSummary> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await withAudit(actor, async (tx, log) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          role: input.role,
          locale: input.locale,
          passwordHash,
          ...(input.role === 'STUDENT'
            ? {
                student: {
                  create: {
                    rollNo: input.rollNo,
                    cgpa: new Prisma.Decimal(input.cgpa),
                    phone: input.phone ?? null,
                  },
                },
              }
            : {}),
          ...(input.role === 'TRAINER'
            ? {
                trainer: {
                  create: {
                    employeeCode: input.employeeCode,
                    specialization: input.specialization ?? null,
                    phone: input.phone ?? null,
                  },
                },
              }
            : {}),
        },
        select: summarySelect,
      });
      const { password: _password, ...safe } = input;
      await log({ action: 'USER_CREATED', entity: 'User', entityId: user.id, newValue: safe });
      return toSummary(user);
    });
  } catch (err) {
    conflictFromUnique(err);
  }
}

export async function updateUser(
  actor: Actor & { userId: string },
  userId: string,
  input: AdminUpdateUserInput,
): Promise<UserSummary> {
  if (userId === actor.userId && input.isActive === false) {
    throw AppError.conflict('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account');
  }
  return withAudit(actor, async (tx, log) => {
    const before = await tx.user.findUnique({ where: { id: userId }, select: summarySelect });
    if (!before) throw AppError.notFound('User not found');
    const reactivating = input.isActive === true && !before.isActive;
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        ...input,
        // Reactivation also clears any login lock so the user can sign in straight away.
        ...(reactivating ? { failedLoginCount: 0, lockedUntil: null } : {}),
      },
      select: summarySelect,
    });
    if (input.isActive === false) await revokeUserSessions(tx, userId);
    const action =
      input.isActive === false
        ? 'USER_DEACTIVATED'
        : reactivating
          ? 'USER_REACTIVATED'
          : 'USER_UPDATED';
    await log({
      action,
      entity: 'User',
      entityId: userId,
      oldValue: { fullName: before.fullName, isActive: before.isActive, locale: before.locale },
      newValue: input,
    });
    return toSummary(user);
  });
}

/** Active accounts per role (admin dashboard, BRQ-9.1). */
export async function activeCounts(): Promise<{ students: number; trainers: number }> {
  const rows = await prisma().user.groupBy({
    by: ['role'],
    where: { isActive: true },
    _count: { _all: true },
  });
  const of = (role: string) => rows.find((r) => r.role === role)?._count._all ?? 0;
  return { students: of('STUDENT'), trainers: of('TRAINER') };
}

/** Public-safe identity of a student (passport): name, roll number and optional photo only. */
export async function studentProfile(
  studentId: string,
): Promise<{ id: string; fullName: string; rollNo: string; photoUrl: string | null } | null> {
  const s = await prisma().student.findUnique({
    where: { id: studentId },
    select: { id: true, rollNo: true, photoUrl: true, user: { select: { fullName: true } } },
  });
  return s ? { id: s.id, fullName: s.user.fullName, rollNo: s.rollNo, photoUrl: s.photoUrl } : null;
}

/** Names and roll numbers for a set of students (lists in other modules). */
export async function studentSummaries(
  ids: string[],
): Promise<Map<string, { id: string; fullName: string; rollNo: string; userId: string }>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma().student.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, rollNo: true, userId: true, user: { select: { fullName: true } } },
  });
  return new Map(
    rows.map((s) => [
      s.id,
      { id: s.id, fullName: s.user.fullName, rollNo: s.rollNo, userId: s.userId },
    ]),
  );
}

/** Display names for a set of users. */
export async function userNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma().user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, fullName: true },
  });
  return new Map(rows.map((u) => [u.id, u.fullName]));
}

/** Active administrators (escalation notices, action owners). */
export async function activeAdmins(): Promise<Array<{ id: string; fullName: string }>> {
  return prisma().user.findMany({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true },
  });
}

/** Name and email for a set of users (audit viewer). */
export async function userIdentities(
  ids: string[],
): Promise<Map<string, { id: string; fullName: string; email: string }>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma().user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, fullName: true, email: true },
  });
  return new Map(rows.map((u) => [u.id, u]));
}

/** A student by roll number (case-insensitive), for staff lookups such as placements. */
export async function studentByRollNo(
  rollNo: string,
): Promise<{ id: string; fullName: string; rollNo: string } | null> {
  const s = await prisma().student.findFirst({
    where: { rollNo: { equals: rollNo.trim(), mode: 'insensitive' } },
    select: { id: true, rollNo: true, user: { select: { fullName: true } } },
  });
  return s ? { id: s.id, fullName: s.user.fullName, rollNo: s.rollNo } : null;
}
