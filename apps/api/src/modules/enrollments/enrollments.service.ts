import { Prisma } from '@prisma/client';
import type {
  AdminEnrollmentQuery,
  AdminEnrollmentRow,
  Enrollment,
  EnrollmentHistoryEntry,
  EnrollmentStatus,
  MyEnrollment,
  NotificationType,
  Paginated,
  ReviewAction,
} from '@vtmp/shared';
import { audit, withAudit, type Actor, type AuditFn } from '../../core/audit';
import { prisma, type Tx } from '../../core/db';
import { AppError } from '../../core/errors';
import { paginated, parsePagination } from '../../core/http';
import { settings } from '../../core/settings';
import * as coursesService from '../courses/courses.service';
import { isWindowOpen } from '../courses/rules';
import { notify } from '../notifications/notifications.service';
import { REVIEW_TARGET, canReview, isEditable, preferenceCountProblem } from './rules';

export interface StudentActor extends Actor {
  userId: string;
  studentId: string;
}

// ─── Mapping ───────────────────────────────────────────────────────────────────

const enrollmentInclude = {
  cycle: { select: { name: true } },
  preferences: {
    orderBy: { rank: 'asc' },
    include: {
      course: {
        select: {
          id: true,
          code: true,
          title: true,
          isActive: true,
          offerings: {
            select: {
              cycleId: true,
              isOpen: true,
              enrollmentOpensAt: true,
              enrollmentClosesAt: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.EnrollmentInclude;

type EnrollmentRow = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentInclude }>;

function allWindowsOpen(e: EnrollmentRow, now: Date): boolean {
  return e.preferences.every((p) => {
    const offering = p.course.offerings.find((o) => o.cycleId === e.cycleId);
    return p.course.isActive && isWindowOpen(offering, now);
  });
}

function toDto(e: EnrollmentRow, now = new Date()): Enrollment {
  return {
    id: e.id,
    cycleId: e.cycleId,
    cycleName: e.cycle.name,
    status: e.status,
    reason: e.reason,
    submittedAt: e.submittedAt.toISOString(),
    decidedAt: e.decidedAt?.toISOString() ?? null,
    preferences: e.preferences.map((p) => ({
      rank: p.rank,
      courseId: p.course.id,
      courseCode: p.course.code,
      courseTitle: p.course.title,
    })),
    editable: isEditable(e.status, allWindowsOpen(e, now)),
  };
}

/** Status timeline from the audit trail (BRQ-3.4): every logged change that set a status. */
async function historyOf(enrollmentId: string): Promise<EnrollmentHistoryEntry[]> {
  const rows = await audit.history('Enrollment', enrollmentId);
  return rows.flatMap((r) => {
    const v = r.newValue as { status?: EnrollmentStatus; reason?: string | null } | null;
    return v?.status
      ? [{ status: v.status, reason: v.reason ?? null, at: r.createdAt.toISOString() }]
      : [];
  });
}

// ─── Course availability (BR-02) ───────────────────────────────────────────────

/** Every chosen course must exist, be active and have its window open right now. */
async function assertWindowsOpen(cycleId: string, courseIds: string[]): Promise<void> {
  const found = await coursesService.availability(cycleId, courseIds);
  const now = new Date();
  for (const id of courseIds) {
    const course = found.find((c) => c.courseId === id);
    if (!course) {
      throw AppError.unprocessable('UNKNOWN_COURSE', 'One of the chosen courses does not exist', [
        { path: 'courseIds', message: id },
      ]);
    }
    if (!course.isActive || !isWindowOpen(course.offering, now)) {
      throw AppError.conflict(
        'ENROLLMENT_WINDOW_CLOSED',
        `Enrollment for "${course.title}" is not open in this cycle`,
      );
    }
  }
}

async function assertPreferenceCount(courseIds: string[]): Promise<void> {
  const max = await settings.get('enrollment.maxPreferences');
  const problem = preferenceCountProblem(courseIds, max);
  if (problem) {
    throw AppError.unprocessable('TOO_MANY_PREFERENCES', problem, [
      { path: 'courseIds', message: problem },
    ]);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

const duplicate = () =>
  AppError.conflict(
    'DUPLICATE_ENROLLMENT',
    'You already have an active application for this training cycle',
  );

// ─── Student actions (BRQ-3.1, 3.2, 3.4) ───────────────────────────────────────

export async function submit(
  actor: StudentActor,
  input: { cycleId: string; courseIds: string[] },
): Promise<Enrollment> {
  await coursesService.getCycle(input.cycleId);
  await assertPreferenceCount(input.courseIds);
  await assertWindowsOpen(input.cycleId, input.courseIds);
  try {
    return await withAudit(actor, async (tx, log) => {
      const created = await tx.enrollment.create({
        data: {
          studentId: actor.studentId,
          cycleId: input.cycleId,
          preferences: {
            create: input.courseIds.map((courseId, i) => ({ courseId, rank: i + 1 })),
          },
        },
        include: enrollmentInclude,
      });
      await log({
        action: 'ENROLLMENT_SUBMITTED',
        entity: 'Enrollment',
        entityId: created.id,
        newValue: { status: created.status, courseIds: input.courseIds },
      });
      return toDto(created);
    });
  } catch (err) {
    // BR-01 is enforced by the partial unique index; map its violation to the business error.
    if (isUniqueViolation(err)) throw duplicate();
    throw err;
  }
}

async function loadForStudent(actor: StudentActor, id: string): Promise<EnrollmentRow> {
  const e = await prisma().enrollment.findUnique({ where: { id }, include: enrollmentInclude });
  if (!e) throw AppError.notFound('Application not found');
  if (e.studentId !== actor.studentId) throw AppError.forbidden();
  return e;
}

function assertEditable(e: EnrollmentRow): void {
  if (e.status !== 'PENDING') {
    throw AppError.conflict('ENROLLMENT_NOT_EDITABLE', 'Only pending applications can be changed');
  }
  if (!allWindowsOpen(e, new Date())) {
    throw AppError.conflict(
      'ENROLLMENT_WINDOW_CLOSED',
      'The enrollment window has closed, so this application can no longer be changed',
    );
  }
}

export async function updatePreferences(
  actor: StudentActor,
  id: string,
  courseIds: string[],
): Promise<Enrollment> {
  const before = await loadForStudent(actor, id);
  assertEditable(before);
  await assertPreferenceCount(courseIds);
  await assertWindowsOpen(before.cycleId, courseIds);
  return withAudit(actor, async (tx, log) => {
    // Guard against a concurrent review: only replace preferences while still pending.
    const still = await tx.enrollment.updateMany({
      where: { id, status: 'PENDING' },
      data: { updatedAt: new Date() },
    });
    if (still.count === 0) {
      throw AppError.conflict(
        'ENROLLMENT_NOT_EDITABLE',
        'Only pending applications can be changed',
      );
    }
    await tx.enrollmentPreference.deleteMany({ where: { enrollmentId: id } });
    await tx.enrollmentPreference.createMany({
      data: courseIds.map((courseId, i) => ({ enrollmentId: id, courseId, rank: i + 1 })),
    });
    const updated = await tx.enrollment.findUniqueOrThrow({
      where: { id },
      include: enrollmentInclude,
    });
    await log({
      action: 'ENROLLMENT_UPDATED',
      entity: 'Enrollment',
      entityId: id,
      oldValue: { courseIds: before.preferences.map((p) => p.course.id) },
      newValue: { courseIds },
    });
    return toDto(updated);
  });
}

export async function withdraw(actor: StudentActor, id: string): Promise<Enrollment> {
  const before = await loadForStudent(actor, id);
  assertEditable(before);
  return withAudit(actor, async (tx, log) => {
    const result = await tx.enrollment.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'WITHDRAWN', decidedAt: new Date() },
    });
    if (result.count === 0) {
      throw AppError.conflict(
        'ENROLLMENT_NOT_EDITABLE',
        'Only pending applications can be changed',
      );
    }
    await log({
      action: 'ENROLLMENT_WITHDRAWN',
      entity: 'Enrollment',
      entityId: id,
      oldValue: { status: before.status },
      newValue: { status: 'WITHDRAWN', reason: null },
    });
    return toDto(
      await tx.enrollment.findUniqueOrThrow({ where: { id }, include: enrollmentInclude }),
    );
  });
}

/** The student's applications across cycles, newest first, each with its status timeline. */
export async function mine(studentId: string): Promise<MyEnrollment[]> {
  const rows = await prisma().enrollment.findMany({
    where: { studentId },
    include: enrollmentInclude,
    orderBy: { submittedAt: 'desc' },
  });
  const now = new Date();
  return Promise.all(rows.map(async (e) => ({ ...toDto(e, now), history: await historyOf(e.id) })));
}

// ─── Admin review (BRQ-3.3, BR-12) ─────────────────────────────────────────────

export async function adminList(
  query: AdminEnrollmentQuery,
): Promise<Paginated<AdminEnrollmentRow>> {
  const page = parsePagination(query);
  const q = query.q;
  const where: Prisma.EnrollmentWhereInput = {
    ...(query.cycleId ? { cycleId: query.cycleId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.courseId ? { preferences: { some: { courseId: query.courseId } } } : {}),
    ...(q
      ? {
          student: {
            OR: [
              { rollNo: { contains: q, mode: 'insensitive' } },
              { user: { fullName: { contains: q, mode: 'insensitive' } } },
              { user: { email: { contains: q, mode: 'insensitive' } } },
            ],
          },
        }
      : {}),
  };
  const include = {
    ...enrollmentInclude,
    student: {
      select: {
        id: true,
        rollNo: true,
        cgpa: true,
        user: { select: { fullName: true, email: true } },
      },
    },
  } satisfies Prisma.EnrollmentInclude;
  const [rows, total] = await prisma().$transaction([
    // Oldest first: applications are reviewed in the order they arrived.
    prisma().enrollment.findMany({
      where,
      include,
      orderBy: { submittedAt: 'asc' },
      skip: page.skip,
      take: page.take,
    }),
    prisma().enrollment.count({ where }),
  ]);
  const now = new Date();
  return paginated(
    rows.map((e) => ({
      ...toDto(e, now),
      student: {
        id: e.student.id,
        rollNo: e.student.rollNo,
        fullName: e.student.user.fullName,
        email: e.student.user.email,
        cgpa: e.student.cgpa.toFixed(2),
      },
    })),
    total,
    page,
  );
}

const NOTIFICATION: Record<ReviewAction, { type: NotificationType; title: string }> = {
  APPROVE: { type: 'ENROLLMENT_APPROVED', title: 'Application approved' },
  REJECT: { type: 'ENROLLMENT_REJECTED', title: 'Application not approved' },
  WAITLIST: { type: 'ENROLLMENT_WAITLISTED', title: 'Application waitlisted' },
};

/**
 * Approves, rejects or waitlists one or many applications in ONE transaction: any unknown id
 * or invalid transition rolls back the whole batch (TC-05). Each change writes an audit row and
 * an in-app notification for the student in the same transaction.
 */
export async function review(
  actor: Actor,
  ids: string[],
  action: ReviewAction,
  reason?: string,
): Promise<Enrollment[]> {
  if (action === 'REJECT' && !reason) {
    throw AppError.unprocessable('REASON_REQUIRED', 'A reason is required to reject');
  }
  const target = REVIEW_TARGET[action];
  const storedReason = action === 'APPROVE' ? null : (reason ?? null);

  return withAudit(
    actor,
    async (tx, log) => {
      const rows = await tx.enrollment.findMany({
        where: { id: { in: ids } },
        include: {
          cycle: { select: { name: true } },
          student: { select: { rollNo: true, userId: true } },
        },
      });
      const missing = ids.filter((id) => !rows.some((r) => r.id === id));
      if (missing.length) {
        throw new AppError(404, 'NOT_FOUND', `Application not found: ${missing.join(', ')}`);
      }
      const invalid = rows.filter((r) => !canReview(r.status, action));
      if (invalid.length) {
        const list = invalid.map((r) => `${r.student.rollNo} (${r.status})`).join(', ');
        throw AppError.conflict(
          'INVALID_STATUS_TRANSITION',
          `Cannot ${action.toLowerCase()}: ${list}`,
        );
      }

      const decidedAt = new Date();
      for (const r of rows) {
        // Conditional update: a concurrent change to the same row aborts the whole batch.
        const changed = await tx.enrollment.updateMany({
          where: { id: r.id, status: r.status },
          data: { status: target, reason: storedReason, decidedAt, decidedById: actor.userId },
        });
        if (changed.count !== 1) {
          throw AppError.conflict(
            'CONCURRENT_UPDATE',
            `Application ${r.student.rollNo} changed while being reviewed`,
          );
        }
        await log({
          action: `ENROLLMENT_${target}`,
          entity: 'Enrollment',
          entityId: r.id,
          oldValue: { status: r.status, reason: r.reason },
          newValue: { status: target, reason: storedReason },
        });
      }

      await notify(
        tx,
        rows.map((r) => ({
          userId: r.student.userId,
          type: NOTIFICATION[action].type,
          title: NOTIFICATION[action].title,
          body: storedReason
            ? `${r.cycle.name}: ${storedReason}`
            : `Your application for ${r.cycle.name} was updated.`,
          data: { cycleName: r.cycle.name, ...(storedReason ? { reason: storedReason } : {}) },
          link: '/student/enrollment',
        })),
      );

      const updated = await tx.enrollment.findMany({
        where: { id: { in: ids } },
        include: enrollmentInclude,
      });
      const now = new Date();
      // Keep the caller's order in the response.
      return ids.map((id) =>
        toDto(
          updated.find((u) => u.id === id)!,
          now,
        ),
      );
    },
    { timeoutMs: 30_000 },
  );
}

// ─── For the catalogue (courses module asks; it never reads these tables) ──────

/**
 * Approved applications not yet placed in a batch, counted against their first preference.
 * The catalogue adds real batch membership (batches module) to get seats taken.
 */
export async function approvedFirstChoice(cycleId: string): Promise<Map<string, number>> {
  const rows = await prisma().$queryRaw<{ course_id: string; taken: number }[]>`
    SELECT p.course_id, COUNT(*)::int AS taken
    FROM enrollments e
    JOIN enrollment_preferences p ON p.enrollment_id = e.id AND p.rank = 1
    WHERE e.cycle_id = ${cycleId}::uuid AND e.status = 'APPROVED'
    GROUP BY p.course_id`;
  return new Map(rows.map((r) => [r.course_id, Number(r.taken)]));
}

// ─── For the batches module (allocation, placement) ─────────────────────────────
// Batches never reads enrollment tables; it asks through these functions (CLAUDE.md rule 5).

export interface AllocationApplicant {
  enrollmentId: string;
  studentId: string;
  userId: string;
  rollNo: string;
  fullName: string;
  cgpa: number;
  submittedAt: Date;
  updatedAt: Date;
  /** Course ids in rank order. */
  preferences: string[];
}

/** APPROVED applications in a cycle: the input to the allocation engine. */
export async function approvedApplicants(cycleId: string): Promise<AllocationApplicant[]> {
  const rows = await prisma().enrollment.findMany({
    where: { cycleId, status: 'APPROVED' },
    select: {
      id: true,
      submittedAt: true,
      updatedAt: true,
      preferences: { orderBy: { rank: 'asc' }, select: { courseId: true } },
      student: {
        select: {
          id: true,
          rollNo: true,
          cgpa: true,
          user: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    enrollmentId: r.id,
    studentId: r.student.id,
    userId: r.student.user.id,
    rollNo: r.student.rollNo,
    fullName: r.student.user.fullName,
    cgpa: Number(r.student.cgpa),
    submittedAt: r.submittedAt,
    updatedAt: r.updatedAt,
    preferences: r.preferences.map((p) => p.courseId),
  }));
}

export interface PlacementFacts {
  id: string;
  studentId: string;
  userId: string;
  cycleId: string;
  cycleName: string;
  status: EnrollmentStatus;
  reason: string | null;
  preferences: string[];
  rollNo: string;
  fullName: string;
}

export async function placementFacts(enrollmentId: string): Promise<PlacementFacts | null> {
  const e = await prisma().enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      studentId: true,
      cycleId: true,
      status: true,
      reason: true,
      cycle: { select: { name: true } },
      preferences: { orderBy: { rank: 'asc' }, select: { courseId: true } },
      student: { select: { rollNo: true, user: { select: { id: true, fullName: true } } } },
    },
  });
  if (!e) return null;
  return {
    id: e.id,
    studentId: e.studentId,
    userId: e.student.user.id,
    cycleId: e.cycleId,
    cycleName: e.cycle.name,
    status: e.status,
    reason: e.reason,
    preferences: e.preferences.map((p) => p.courseId),
    rollNo: e.student.rollNo,
    fullName: e.student.user.fullName,
  };
}

/** Current status and reason of several applications (completion queue). */
export async function statusesOf(
  enrollmentIds: string[],
): Promise<Map<string, { status: EnrollmentStatus; reason: string | null }>> {
  const rows = await prisma().enrollment.findMany({
    where: { id: { in: enrollmentIds } },
    select: { id: true, status: true, reason: true },
  });
  return new Map(rows.map((r) => [r.id, { status: r.status, reason: r.reason }]));
}

/** APPROVED or WAITLISTED applicants in a cycle who listed this course (for manual placement). */
export async function candidatesForCourse(cycleId: string, courseId: string) {
  const rows = await prisma().enrollment.findMany({
    where: {
      cycleId,
      status: { in: ['APPROVED', 'WAITLISTED'] },
      preferences: { some: { courseId } },
    },
    orderBy: { submittedAt: 'asc' },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      preferences: { select: { courseId: true, rank: true } },
      student: { select: { rollNo: true, cgpa: true, user: { select: { fullName: true } } } },
    },
  });
  return rows.map((r) => ({
    enrollmentId: r.id,
    status: r.status,
    rollNo: r.student.rollNo,
    fullName: r.student.user.fullName,
    cgpa: r.student.cgpa.toFixed(2),
    submittedAt: r.submittedAt.toISOString(),
    rankForCourse: r.preferences.find((p) => p.courseId === courseId)?.rank ?? 0,
  }));
}

export interface StatusChange {
  enrollmentId: string;
  from: readonly EnrollmentStatus[];
  to: EnrollmentStatus;
  reason?: string | null;
  /** Optional notification for the student. */
  notify?: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data: Record<string, string>;
  };
}

/**
 * Status changes requested by the batches module, inside ITS transaction (set-based, so a
 * 500-student allocation stays a handful of queries). Every row must currently be in one of its
 * expected `from` statuses; rows are updated with that status as a condition, so a concurrent
 * change makes the counts disagree and aborts the whole transaction (409 CONCURRENT_UPDATE).
 * Audit rows and notifications are written in the same transaction.
 */
export async function changeStatuses(tx: Tx, log: AuditFn, changes: StatusChange[]): Promise<void> {
  if (changes.length === 0) return;
  const before = new Map(
    (
      await tx.enrollment.findMany({
        where: { id: { in: changes.map((c) => c.enrollmentId) } },
        select: { id: true, status: true, reason: true },
      })
    ).map((e) => [e.id, e]),
  );
  const stale = () =>
    AppError.conflict(
      'CONCURRENT_UPDATE',
      'An application changed while this action was running. Refresh and try again.',
    );

  // Group identical updates: same current status, target status and reason.
  const groups = new Map<string, { from: EnrollmentStatus; c: StatusChange; ids: string[] }>();
  for (const c of changes) {
    const b = before.get(c.enrollmentId);
    if (!b || !c.from.includes(b.status)) throw stale();
    const key = `${b.status}|${c.to}|${c.reason === undefined ? ' ' : (c.reason ?? '')}`;
    const g = groups.get(key) ?? { from: b.status, c, ids: [] };
    g.ids.push(c.enrollmentId);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const updated = await tx.enrollment.updateMany({
      where: { id: { in: g.ids }, status: g.from },
      data: { status: g.c.to, ...(g.c.reason !== undefined ? { reason: g.c.reason } : {}) },
    });
    if (updated.count !== g.ids.length) throw stale();
  }

  await log.many(
    changes.map((c) => {
      const b = before.get(c.enrollmentId)!;
      return {
        action: `ENROLLMENT_${c.to}`,
        entity: 'Enrollment',
        entityId: c.enrollmentId,
        oldValue: { status: b.status, reason: b.reason },
        newValue: { status: c.to, reason: c.reason === undefined ? b.reason : c.reason },
      };
    }),
  );
  await notify(
    tx,
    changes.flatMap((c) => (c.notify ? [{ ...c.notify, link: '/student' }] : [])),
  );
}
