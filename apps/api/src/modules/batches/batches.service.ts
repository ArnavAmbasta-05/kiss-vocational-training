import { Prisma } from '@prisma/client';
import type {
  BatchCreateInput,
  BatchDetail,
  BatchStatus,
  BatchSummary,
  BatchUpdateInput,
  Candidate,
  EnrollmentStatus,
  Role,
  RosterEntry,
  SessionCreateInput,
  SessionDto,
  TrainerOption,
} from '@vtmp/shared';
import { withAudit, type Actor } from '../../core/audit';
import { prisma, type Tx } from '../../core/db';
import { AppError } from '../../core/errors';
import { settings } from '../../core/settings';
import * as enrollments from '../enrollments/enrollments.service';
import { expandRecurring, MAX_GENERATED_SESSIONS } from './sessionsSchedule';

const day = (d: Date) => d.toISOString().slice(0, 10);

// ─── Mapping ───────────────────────────────────────────────────────────────────

const sessionInclude = { trainer: { select: { user: { select: { fullName: true } } } } } as const;
type SessionRow = Prisma.TrainingSessionGetPayload<{ include: typeof sessionInclude }>;

export function toSession(s: SessionRow): SessionDto {
  return {
    id: s.id,
    batchId: s.batchId,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    venue: s.venue,
    topic: s.topic,
    status: s.status,
    trainerId: s.trainerId,
    trainerName: s.trainer?.user.fullName ?? null,
  };
}

const batchInclude = (now: Date) =>
  ({
    course: { select: { code: true, title: true } },
    cycle: { select: { name: true } },
    trainers: {
      orderBy: { assignedAt: 'asc' },
      select: { trainer: { select: { id: true, user: { select: { fullName: true } } } } },
    },
    _count: { select: { students: true } },
    sessions: {
      where: { status: 'SCHEDULED', startsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 1,
      include: sessionInclude,
    },
  }) satisfies Prisma.BatchInclude;

type BatchRow = Prisma.BatchGetPayload<{ include: ReturnType<typeof batchInclude> }>;

function toSummary(b: BatchRow): BatchSummary {
  return {
    id: b.id,
    name: b.name,
    courseId: b.courseId,
    courseCode: b.course.code,
    courseTitle: b.course.title,
    cycleId: b.cycleId,
    cycleName: b.cycle.name,
    capacity: b.capacity,
    enrolled: b._count.students,
    startDate: day(b.startDate),
    endDate: day(b.endDate),
    venue: b.venue,
    status: b.status,
    trainers: b.trainers.map((t) => ({ id: t.trainer.id, fullName: t.trainer.user.fullName })),
    nextSession: b.sessions[0] ? toSession(b.sessions[0]) : null,
  };
}

async function loadBatch(client: Tx, id: string): Promise<BatchRow> {
  const b = await client.batch.findUnique({ where: { id }, include: batchInclude(new Date()) });
  if (!b) throw AppError.notFound('Batch not found');
  return b;
}

/** Row lock so concurrent placements cannot overfill a batch (BR-03). */
async function lockBatch(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<
    { id: string; capacity: number; status: BatchStatus; cycle_id: string; course_id: string }[]
  >`
    SELECT id, capacity, status::text AS status, cycle_id, course_id
    FROM batches WHERE id = ${id}::uuid FOR UPDATE`;
  const b = rows[0];
  if (!b) throw AppError.notFound('Batch not found');
  const members = await tx.batchStudent.count({ where: { batchId: id } });
  return { ...b, members };
}

// ─── Reads ─────────────────────────────────────────────────────────────────────

export async function list(filters: {
  cycleId?: string;
  courseId?: string;
  status?: BatchStatus;
}): Promise<BatchSummary[]> {
  const rows = await prisma().batch.findMany({
    where: filters,
    include: batchInclude(new Date()),
    orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
  });
  return rows.map(toSummary);
}

export async function detail(id: string, viewerRole: Role): Promise<BatchDetail> {
  const b = await loadBatch(prisma(), id);
  let roster: RosterEntry[] | null = null;
  if (viewerRole !== 'STUDENT') {
    const members = await prisma().batchStudent.findMany({
      where: { batchId: id },
      orderBy: { student: { rollNo: 'asc' } },
      select: {
        enrollmentId: true,
        allocatedAt: true,
        enrollment: { select: { status: true } },
        student: {
          select: {
            id: true,
            rollNo: true,
            phone: true,
            cgpa: true,
            user: { select: { fullName: true, email: true } },
          },
        },
      },
    });
    roster = members.map((m) => ({
      enrollmentId: m.enrollmentId,
      studentId: m.student.id,
      rollNo: m.student.rollNo,
      fullName: m.student.user.fullName,
      email: m.student.user.email,
      phone: m.student.phone,
      cgpa: m.student.cgpa.toFixed(2),
      enrollmentStatus: m.enrollment.status,
      allocatedAt: m.allocatedAt.toISOString(),
    }));
  }
  return { ...toSummary(b), roster };
}

/** Student: the batches they are placed in. Trainer: their assigned batches (BR-05). */
export async function mine(user: {
  role: Role;
  studentId: string | null;
  trainerId: string | null;
}): Promise<BatchSummary[]> {
  const where: Prisma.BatchWhereInput =
    user.role === 'STUDENT'
      ? { students: { some: { studentId: user.studentId ?? '' } } }
      : user.role === 'TRAINER'
        ? { trainers: { some: { trainerId: user.trainerId ?? '' } } }
        : {};
  const rows = await prisma().batch.findMany({
    where,
    include: batchInclude(new Date()),
    orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
  });
  return rows.map(toSummary);
}

export async function sessions(batchId: string): Promise<SessionDto[]> {
  const rows = await prisma().trainingSession.findMany({
    where: { batchId },
    orderBy: { startsAt: 'asc' },
    include: sessionInclude,
  });
  return rows.map(toSession);
}

export async function trainers(): Promise<TrainerOption[]> {
  const rows = await prisma().trainer.findMany({
    where: { user: { isActive: true } },
    orderBy: { user: { fullName: 'asc' } },
    select: {
      id: true,
      employeeCode: true,
      specialization: true,
      user: { select: { fullName: true } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    fullName: t.user.fullName,
    employeeCode: t.employeeCode,
    specialization: t.specialization,
  }));
}

export async function candidates(batchId: string): Promise<Candidate[]> {
  const b = await prisma().batch.findUnique({
    where: { id: batchId },
    select: { cycleId: true, courseId: true },
  });
  if (!b) throw AppError.notFound('Batch not found');
  return enrollments.candidatesForCourse(b.cycleId, b.courseId);
}

/** Students placed in batches, per course, in a cycle (for the catalogue's seats). */
export async function membersByCourse(cycleId: string): Promise<Map<string, number>> {
  const rows = await prisma().$queryRaw<{ course_id: string; n: number }[]>`
    SELECT b.course_id, COUNT(*)::int AS n
    FROM batch_students bs JOIN batches b ON b.id = bs.batch_id
    WHERE b.cycle_id = ${cycleId}::uuid
    GROUP BY b.course_id`;
  return new Map(rows.map((r) => [r.course_id, Number(r.n)]));
}

// ─── Admin: batches (BRQ-4.1) ──────────────────────────────────────────────────

export async function create(actor: Actor, input: BatchCreateInput): Promise<BatchSummary> {
  try {
    return await withAudit(actor, async (tx, log) => {
      const [course, cycle] = await Promise.all([
        tx.course.findUnique({ where: { id: input.courseId }, select: { isActive: true } }),
        tx.trainingCycle.findUnique({ where: { id: input.cycleId }, select: { id: true } }),
      ]);
      if (!course) throw AppError.notFound('Course not found');
      if (!cycle) throw AppError.notFound('Training cycle not found');
      if (!course.isActive)
        throw AppError.conflict('COURSE_INACTIVE', 'This course is deactivated');
      const b = await tx.batch.create({
        data: {
          ...input,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        },
      });
      await log({ action: 'BATCH_CREATED', entity: 'Batch', entityId: b.id, newValue: b });
      return toSummary(await loadBatch(tx, b.id));
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw AppError.conflict(
        'BATCH_NAME_TAKEN',
        'This course already has a batch with that name in the cycle',
      );
    }
    throw err;
  }
}

export async function update(
  actor: Actor,
  id: string,
  input: BatchUpdateInput,
): Promise<BatchSummary> {
  return withAudit(actor, async (tx, log) => {
    const locked = await lockBatch(tx, id);
    if (locked.status === 'CLOSED')
      throw AppError.conflict('BATCH_CLOSED', 'Closed batches cannot change');
    if (input.capacity !== undefined && input.capacity < locked.members) {
      throw AppError.conflict(
        'CAPACITY_BELOW_ENROLLED',
        `Capacity cannot be below the ${locked.members} students already in the batch`,
      );
    }
    const before = await tx.batch.findUniqueOrThrow({ where: { id } });
    const startDate = input.startDate ? new Date(input.startDate) : before.startDate;
    const endDate = input.endDate ? new Date(input.endDate) : before.endDate;
    if (endDate < startDate)
      throw AppError.unprocessable('INVALID_DATES', 'The batch must end on or after its start');
    const b = await tx.batch.update({
      where: { id },
      data: { name: input.name, capacity: input.capacity, venue: input.venue, startDate, endDate },
    });
    await log({
      action: 'BATCH_UPDATED',
      entity: 'Batch',
      entityId: id,
      oldValue: before,
      newValue: b,
    });
    return toSummary(await loadBatch(tx, id));
  });
}

/** PLANNED → ACTIVE; its students' enrollments ALLOCATED → ACTIVE. Needs a trainer. */
export async function activate(actor: Actor, id: string): Promise<BatchSummary> {
  return withAudit(
    actor,
    async (tx, log) => {
      const locked = await lockBatch(tx, id);
      if (locked.status !== 'PLANNED') {
        throw AppError.conflict(
          'INVALID_BATCH_STATUS',
          `Only planned batches can be activated (this one is ${locked.status})`,
        );
      }
      const trainerCount = await tx.trainerAssignment.count({ where: { batchId: id } });
      if (trainerCount === 0)
        throw AppError.conflict('NO_TRAINER', 'Assign at least one trainer before activating');
      await tx.batch.update({ where: { id }, data: { status: 'ACTIVE' } });
      await log({
        action: 'BATCH_ACTIVATED',
        entity: 'Batch',
        entityId: id,
        oldValue: { status: 'PLANNED' },
        newValue: { status: 'ACTIVE' },
      });
      const members = await tx.batchStudent.findMany({
        where: { batchId: id },
        select: { enrollmentId: true, student: { select: { userId: true } } },
      });
      const b = await tx.batch.findUniqueOrThrow({
        where: { id },
        select: { name: true, course: { select: { title: true } } },
      });
      await enrollments.changeStatuses(
        tx,
        log,
        members.map((m) => ({
          enrollmentId: m.enrollmentId,
          from: ['ALLOCATED', 'ACTIVE'],
          to: 'ACTIVE' as EnrollmentStatus,
          notify: {
            userId: m.student.userId,
            type: 'BATCH_ACTIVATED' as const,
            title: 'Training has started',
            body: `${b.course.title}, ${b.name}`,
            data: { courseTitle: b.course.title, batchName: b.name },
          },
        })),
      );
      return toSummary(await loadBatch(tx, id));
    },
    { timeoutMs: 30_000 },
  );
}

// ─── Admin: placing students (BRQ-4.4, BR-03) ──────────────────────────────────

const placedStatus = (batchStatus: BatchStatus): EnrollmentStatus =>
  batchStatus === 'ACTIVE' ? 'ACTIVE' : 'ALLOCATED';

/** Places an APPROVED or WAITLISTED applicant in a batch ("promote from waitlist"). */
export async function addStudent(
  actor: Actor,
  batchId: string,
  enrollmentId: string,
): Promise<BatchDetail> {
  const facts = await enrollments.placementFacts(enrollmentId);
  if (!facts) throw AppError.notFound('Application not found');
  if (facts.status !== 'APPROVED' && facts.status !== 'WAITLISTED') {
    throw AppError.conflict(
      'NOT_PLACEABLE',
      `Only approved or waitlisted applications can be placed (this one is ${facts.status})`,
    );
  }
  await withAudit(actor, async (tx, log) => {
    const b = await lockBatch(tx, batchId);
    if (b.status === 'CLOSED') throw AppError.conflict('BATCH_CLOSED', 'This batch is closed');
    if (await tx.batchStudent.findUnique({ where: { enrollmentId } })) {
      throw AppError.conflict('ALREADY_PLACED', 'This student is already in a batch');
    }
    if (facts.cycleId !== b.cycle_id)
      throw AppError.conflict('WRONG_CYCLE', 'The application is for a different cycle');
    if (!facts.preferences.includes(b.course_id)) {
      throw AppError.conflict('COURSE_NOT_PREFERRED', 'The student did not choose this course');
    }
    if (b.members >= b.capacity) throw AppError.conflict('BATCH_FULL', 'This batch is full');
    await tx.batchStudent.create({ data: { batchId, enrollmentId, studentId: facts.studentId } });
    await log({
      action: 'BATCH_STUDENT_ADDED',
      entity: 'Batch',
      entityId: batchId,
      newValue: { enrollmentId, studentId: facts.studentId },
    });
    const course = await tx.course.findUniqueOrThrow({
      where: { id: b.course_id },
      select: { title: true },
    });
    const batch = await tx.batch.findUniqueOrThrow({
      where: { id: batchId },
      select: { name: true },
    });
    await enrollments.changeStatuses(tx, log, [
      {
        enrollmentId,
        from: ['APPROVED', 'WAITLISTED'],
        to: placedStatus(b.status),
        reason: null,
        notify: {
          userId: facts.userId,
          type: 'ENROLLMENT_ALLOCATED',
          title: 'You have a batch',
          body: `${course.title}, ${batch.name}`,
          data: { courseTitle: course.title, batchName: batch.name, cycleName: facts.cycleName },
        },
      },
    ]);
  });
  return detail(batchId, 'ADMIN');
}

/** Takes an ALLOCATED student out of a planned batch; the application returns to APPROVED. */
export async function removeStudent(
  actor: Actor,
  batchId: string,
  enrollmentId: string,
): Promise<BatchDetail> {
  await withAudit(actor, async (tx, log) => {
    const b = await lockBatch(tx, batchId);
    const member = await tx.batchStudent.findUnique({ where: { enrollmentId } });
    if (!member || member.batchId !== batchId)
      throw AppError.notFound('This student is not in the batch');
    if (b.status !== 'PLANNED') {
      throw AppError.conflict(
        'BATCH_NOT_PLANNED',
        'Students can only be removed before the batch starts',
      );
    }
    await tx.batchStudent.delete({ where: { enrollmentId } });
    await log({
      action: 'BATCH_STUDENT_REMOVED',
      entity: 'Batch',
      entityId: batchId,
      oldValue: { enrollmentId, studentId: member.studentId },
    });
    await enrollments.changeStatuses(tx, log, [
      { enrollmentId, from: ['ALLOCATED'], to: 'APPROVED' },
    ]);
  });
  return detail(batchId, 'ADMIN');
}

/** Moves a student to another batch in the same cycle and one of their chosen courses (TC-07). */
export async function moveStudent(
  actor: Actor,
  fromBatchId: string,
  enrollmentId: string,
  toBatchId: string,
): Promise<BatchDetail> {
  if (fromBatchId === toBatchId)
    throw AppError.unprocessable('SAME_BATCH', 'Choose a different batch');
  const facts = await enrollments.placementFacts(enrollmentId);
  if (!facts) throw AppError.notFound('Application not found');
  await withAudit(actor, async (tx, log) => {
    // Lock in a stable order so two opposite moves cannot deadlock.
    const [first, second] = [fromBatchId, toBatchId].sort();
    const locks = {
      [first!]: await lockBatch(tx, first!),
      [second!]: await lockBatch(tx, second!),
    };
    const from = locks[fromBatchId]!;
    const to = locks[toBatchId]!;
    const member = await tx.batchStudent.findUnique({ where: { enrollmentId } });
    if (!member || member.batchId !== fromBatchId)
      throw AppError.notFound('This student is not in the batch');
    if (to.status === 'CLOSED')
      throw AppError.conflict('BATCH_CLOSED', 'The target batch is closed');
    if (to.cycle_id !== from.cycle_id)
      throw AppError.conflict('WRONG_CYCLE', 'Batches are in different cycles');
    if (!facts.preferences.includes(to.course_id)) {
      throw AppError.conflict('COURSE_NOT_PREFERRED', 'The student did not choose that course');
    }
    if (to.members >= to.capacity)
      throw AppError.conflict('BATCH_FULL', 'The target batch is full');
    await tx.batchStudent.update({
      where: { enrollmentId },
      data: { batchId: toBatchId, allocatedAt: new Date() },
    });
    await log({
      action: 'BATCH_STUDENT_MOVED',
      entity: 'Enrollment',
      entityId: enrollmentId,
      oldValue: { batchId: fromBatchId },
      newValue: { batchId: toBatchId },
    });
    const target = placedStatus(to.status);
    if (target !== facts.status) {
      await enrollments.changeStatuses(tx, log, [
        { enrollmentId, from: ['ALLOCATED', 'ACTIVE'], to: target },
      ]);
    }
  });
  return detail(toBatchId, 'ADMIN');
}

// ─── Admin: trainers (BRQ-4.3) ─────────────────────────────────────────────────

export async function assignTrainer(
  actor: Actor,
  batchId: string,
  trainerId: string,
): Promise<BatchDetail> {
  await withAudit(actor, async (tx, log) => {
    const b = await lockBatch(tx, batchId);
    if (b.status === 'CLOSED') throw AppError.conflict('BATCH_CLOSED', 'This batch is closed');
    const trainer = await tx.trainer.findUnique({
      where: { id: trainerId },
      select: { user: { select: { isActive: true } } },
    });
    if (!trainer || !trainer.user.isActive) throw AppError.notFound('Trainer not found');
    const exists = await tx.trainerAssignment.findUnique({
      where: { batchId_trainerId: { batchId, trainerId } },
    });
    if (exists) throw AppError.conflict('ALREADY_ASSIGNED', 'This trainer is already assigned');
    await tx.trainerAssignment.create({ data: { batchId, trainerId } });
    await log({
      action: 'TRAINER_ASSIGNED',
      entity: 'Batch',
      entityId: batchId,
      newValue: { trainerId },
    });
  });
  return detail(batchId, 'ADMIN');
}

export async function unassignTrainer(
  actor: Actor,
  batchId: string,
  trainerId: string,
): Promise<BatchDetail> {
  await withAudit(actor, async (tx, log) => {
    const b = await lockBatch(tx, batchId);
    const removed = await tx.trainerAssignment.deleteMany({ where: { batchId, trainerId } });
    if (removed.count === 0) throw AppError.notFound('This trainer is not assigned to the batch');
    if (b.status === 'ACTIVE' && (await tx.trainerAssignment.count({ where: { batchId } })) === 0) {
      throw AppError.conflict('LAST_TRAINER', 'An active batch must keep at least one trainer');
    }
    await log({
      action: 'TRAINER_UNASSIGNED',
      entity: 'Batch',
      entityId: batchId,
      oldValue: { trainerId },
    });
  });
  return detail(batchId, 'ADMIN');
}

// ─── Admin: sessions (BRQ-4.3) ─────────────────────────────────────────────────

export async function createSessions(
  actor: Actor,
  batchId: string,
  input: SessionCreateInput,
): Promise<SessionDto[]> {
  const batch = await prisma().batch.findUnique({ where: { id: batchId } });
  if (!batch) throw AppError.notFound('Batch not found');
  if (batch.status === 'CLOSED') throw AppError.conflict('BATCH_CLOSED', 'This batch is closed');

  let slots: Array<{ startsAt: Date; endsAt: Date }>;
  if (input.kind === 'single') {
    slots = [{ startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) }];
  } else {
    const offset = await settings.get('institution.utcOffsetMinutes');
    try {
      slots = expandRecurring(input, offset);
    } catch (err) {
      const code = (err as Error).message;
      if (code === 'TOO_MANY_SESSIONS') {
        throw AppError.unprocessable(
          'TOO_MANY_SESSIONS',
          `A schedule can create at most ${MAX_GENERATED_SESSIONS} sessions`,
        );
      }
      throw AppError.unprocessable('INVALID_TIMES', 'The session must end after it starts');
    }
  }
  if (slots.length === 0)
    throw AppError.unprocessable('NO_SESSIONS', 'No dates match this schedule');

  // Sessions must fall within the batch's dates (start date 00:00 to end date 23:59 local).
  const offset = await settings.get('institution.utcOffsetMinutes');
  const windowStart = new Date(batch.startDate.getTime() - offset * 60_000);
  const windowEnd = new Date(batch.endDate.getTime() + 86_400_000 - offset * 60_000);
  for (const s of slots) {
    if (s.endsAt <= s.startsAt)
      throw AppError.unprocessable('INVALID_TIMES', 'The session must end after it starts');
    if (s.startsAt < windowStart || s.endsAt > windowEnd) {
      throw AppError.unprocessable(
        'OUTSIDE_BATCH_DATES',
        'Sessions must fall within the batch dates',
      );
    }
  }
  if (input.trainerId) {
    const assigned = await prisma().trainerAssignment.findUnique({
      where: { batchId_trainerId: { batchId, trainerId: input.trainerId } },
    });
    if (!assigned)
      throw AppError.unprocessable('TRAINER_NOT_ASSIGNED', 'Assign the trainer to the batch first');
  }

  return withAudit(actor, async (tx, log) => {
    await tx.trainingSession.createMany({
      data: slots.map((s) => ({
        batchId,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        venue: input.venue ?? batch.venue,
        topic: input.topic ?? null,
        trainerId: input.trainerId ?? null,
      })),
    });
    await log({
      action: 'SESSIONS_SCHEDULED',
      entity: 'Batch',
      entityId: batchId,
      newValue: { count: slots.length, first: slots[0]!.startsAt, last: slots.at(-1)!.startsAt },
    });
    const created = await tx.trainingSession.findMany({
      where: { batchId, startsAt: { in: slots.map((s) => s.startsAt) } },
      orderBy: { startsAt: 'asc' },
      include: sessionInclude,
    });
    return created.map(toSession);
  });
}

export async function cancelSession(
  actor: Actor,
  batchId: string,
  sessionId: string,
): Promise<SessionDto> {
  return withAudit(actor, async (tx, log) => {
    const s = await tx.trainingSession.findUnique({ where: { id: sessionId } });
    if (!s || s.batchId !== batchId) throw AppError.notFound('Session not found');
    if (s.status !== 'SCHEDULED') {
      throw AppError.conflict('SESSION_NOT_SCHEDULED', 'Only scheduled sessions can be cancelled');
    }
    const updated = await tx.trainingSession.update({
      where: { id: sessionId },
      data: { status: 'CANCELLED' },
      include: sessionInclude,
    });
    await log({
      action: 'SESSION_CANCELLED',
      entity: 'TrainingSession',
      entityId: sessionId,
      oldValue: { status: s.status },
      newValue: { status: 'CANCELLED' },
    });
    return toSession(updated);
  });
}
