import type { PrismaClient } from '@prisma/client';
import { audit } from '../core/audit';
import { TRAINERS, makeStudents } from './data';

export const PILOT_CYCLE = 'Pilot cycle (demo)';
export const PILOT_BATCH = 'Pilot batch';
/** Students placed in the pilot batch. They sit below APPLICANTS_FROM and outside student001. */
export const PILOT_STUDENTS = { from: 21, to: 30 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;
/** 10:00–13:00 IST expressed in UTC. */
const START_UTC = { h: 4, m: 30 };
const SESSION_MS = 3 * 60 * 60 * 1000;

/**
 * A batch already in training, so attendance, marks and "My training" have data on a fresh
 * database: a pilot cycle that began four weeks ago, ten students, sessions every other day
 * (past ones conducted with attendance), two assessments with marks and a third still to come,
 * and two progress notes. Skipped entirely if the pilot batch exists, so re-seeding is a no-op.
 */
export async function seedTraining(prisma: PrismaClient, log: (m: string) => void) {
  const existing = await prisma.batch.findFirst({
    where: { name: PILOT_BATCH, cycle: { name: PILOT_CYCLE } },
  });
  if (existing) {
    log('training: pilot batch already present');
    return;
  }

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startsOn = new Date(today.getTime() - 28 * DAY_MS);
  const endsOn = new Date(today.getTime() + 56 * DAY_MS);
  const course = await prisma.course.findUniqueOrThrow({ where: { code: 'ELEC-DOM' } });
  const trainerUser = await prisma.user.findUniqueOrThrow({
    where: { email: TRAINERS[0]!.email },
    include: { trainer: true },
  });
  const trainerId = trainerUser.trainer!.id;
  const pilot = makeStudents(PILOT_STUDENTS.to).filter((s) => s.n >= PILOT_STUDENTS.from);
  const students = await prisma.student.findMany({
    where: { rollNo: { in: pilot.map((s) => s.rollNo) } },
    orderBy: { rollNo: 'asc' },
    select: { id: true },
  });

  await prisma.$transaction(
    async (tx) => {
      const cycle = await tx.trainingCycle.upsert({
        where: { name: PILOT_CYCLE },
        create: { name: PILOT_CYCLE, startsOn, endsOn },
        update: {},
      });
      await tx.courseOffering.upsert({
        where: { courseId_cycleId: { courseId: course.id, cycleId: cycle.id } },
        create: {
          courseId: course.id,
          cycleId: cycle.id,
          enrollmentOpensAt: new Date(startsOn.getTime() - 30 * DAY_MS),
          enrollmentClosesAt: new Date(startsOn.getTime() - 7 * DAY_MS),
          isOpen: false,
        },
        update: {},
      });
      const batch = await tx.batch.create({
        data: {
          courseId: course.id,
          cycleId: cycle.id,
          name: PILOT_BATCH,
          capacity: 15,
          startDate: startsOn,
          endDate: endsOn,
          venue: 'Electrical workshop',
          status: 'ACTIVE',
          trainers: { create: { trainerId } },
        },
      });

      const placed: Array<{ studentId: string; enrollmentId: string }> = [];
      for (const s of students) {
        const e = await tx.enrollment.create({
          data: {
            studentId: s.id,
            cycleId: cycle.id,
            status: 'ACTIVE',
            submittedAt: new Date(startsOn.getTime() - 20 * DAY_MS),
            preferences: { create: { courseId: course.id, rank: 1 } },
          },
        });
        await tx.batchStudent.create({
          data: { batchId: batch.id, enrollmentId: e.id, studentId: s.id },
        });
        placed.push({ studentId: s.id, enrollmentId: e.id });
      }

      // Sessions every other day across the batch; the past ones are conducted and marked.
      let conducted = 0;
      for (let d = 0; startsOn.getTime() + d * DAY_MS <= endsOn.getTime(); d += 2) {
        const startsAt = new Date(startsOn.getTime() + d * DAY_MS);
        startsAt.setUTCHours(START_UTC.h, START_UTC.m);
        const past = startsAt.getTime() + SESSION_MS < now.getTime();
        const session = await tx.trainingSession.create({
          data: {
            batchId: batch.id,
            trainerId,
            startsAt,
            endsAt: new Date(startsAt.getTime() + SESSION_MS),
            venue: 'Electrical workshop',
            topic: `Module ${Math.floor(d / 6) + 1}`,
            status: past ? 'CONDUCTED' : 'SCHEDULED',
          },
        });
        if (!past) continue;
        const markedAt = new Date(startsAt.getTime() + SESSION_MS);
        await tx.attendance.createMany({
          data: placed.map((p, i) => ({
            sessionId: session.id,
            studentId: p.studentId,
            // Deterministic spread: most students attend; the last two miss often, so the
            // summary shows some below the minimum.
            status: absent(i, conducted)
              ? 'ABSENT'
              : (i + conducted) % 9 === 0
                ? 'LATE'
                : 'PRESENT',
            markedById: trainerUser.id,
            firstMarkedAt: markedAt,
            markedAt,
          })),
        });
        conducted++;
      }

      const assessments = [
        { title: 'Safety and tools quiz', mode: 'THEORY', maxMarks: 20, weightage: 1, held: 10 },
        {
          title: 'House wiring practical',
          mode: 'PRACTICAL',
          maxMarks: 50,
          weightage: 2,
          held: 22,
        },
        { title: 'Final theory paper', mode: 'THEORY', maxMarks: 100, weightage: 3, held: null },
      ] as const;
      for (const a of assessments) {
        const created = await tx.assessment.create({
          data: {
            batchId: batch.id,
            title: a.title,
            mode: a.mode,
            maxMarks: a.maxMarks,
            weightage: a.weightage,
            isMandatory: true,
            heldOn: a.held === null ? null : new Date(startsOn.getTime() + a.held * DAY_MS),
            createdById: trainerUser.id,
          },
        });
        if (a.held === null) continue;
        await tx.assessmentResult.createMany({
          data: placed.map((p, i) => ({
            assessmentId: created.id,
            studentId: p.studentId,
            // 45 %–95 % of max, two decimals.
            marks:
              Math.round(a.maxMarks * (0.45 + ((i * 37 + a.weightage * 11) % 51) / 100) * 100) /
              100,
            recordedById: trainerUser.id,
          })),
        });
      }

      await tx.progress.createMany({
        data: [
          {
            batchId: batch.id,
            milestone: 'Module 1 complete: safety and hand tools',
            recordedById: trainerUser.id,
            recordedAt: new Date(startsOn.getTime() + 12 * DAY_MS),
          },
          {
            batchId: batch.id,
            studentId: placed[0]!.studentId,
            milestone: 'Wired a single-phase distribution board unaided',
            note: 'Ready to help peers in the next practical.',
            recordedById: trainerUser.id,
            recordedAt: new Date(startsOn.getTime() + 23 * DAY_MS),
          },
        ],
      });

      await audit.record(tx, {
        userId: null,
        action: 'SEED_TRAINING',
        entity: 'Batch',
        entityId: batch.id,
        newValue: { students: placed.length, conductedSessions: conducted, by: 'seed' },
      });
      log(
        `training: "${PILOT_BATCH}" (${course.code}) active with ${placed.length} students, ${conducted} sessions marked, 2 assessments graded`,
      );
    },
    { timeout: 60_000 },
  );
}

/** The last two students miss roughly every third session; others about one in twelve. */
function absent(student: number, session: number) {
  if (student >= 8) return (session + student) % 3 === 0;
  return (session * 5 + student * 7) % 12 === 0;
}
