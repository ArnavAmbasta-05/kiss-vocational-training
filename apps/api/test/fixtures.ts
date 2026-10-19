import { randomUUID } from 'node:crypto';
import { Prisma, Role, type PrismaClient } from '@prisma/client';

/** Integration tests share one database, so every fixture gets a unique suffix. */
export function uid(): string {
  return randomUUID().slice(0, 8);
}

export async function createStudent(db: PrismaClient) {
  const s = uid();
  const user = await db.user.create({
    data: {
      email: `student-${s}@test.local`,
      fullName: `Test Student ${s}`,
      role: Role.STUDENT,
      passwordHash: 'not-a-real-hash',
      student: { create: { rollNo: `T-${s}`, cgpa: new Prisma.Decimal('7.50') } },
    },
    include: { student: true },
  });
  return { user, student: user.student! };
}

export async function createAdmin(db: PrismaClient) {
  const s = uid();
  return db.user.create({
    data: {
      email: `admin-${s}@test.local`,
      fullName: `Test Admin ${s}`,
      role: Role.ADMIN,
      passwordHash: 'not-a-real-hash',
    },
  });
}

export const TEST_PASSWORD = 'Correct-Horse-1';

/** A user who can actually sign in (real bcrypt hash at test cost). */
export async function createLoginUser(
  db: PrismaClient,
  role: Role,
  opts: { isActive?: boolean } = {},
) {
  const s = uid();
  const { hashPassword } = await import('../src/core/auth/password');
  return db.user.create({
    data: {
      email: `${role.toLowerCase()}-${s}@test.local`,
      fullName: `Test ${role} ${s}`,
      role,
      isActive: opts.isActive ?? true,
      passwordHash: await hashPassword(TEST_PASSWORD),
      ...(role === Role.STUDENT
        ? { student: { create: { rollNo: `T-${s}`, cgpa: new Prisma.Decimal('8.10') } } }
        : {}),
      ...(role === Role.TRAINER ? { trainer: { create: { employeeCode: `E-${s}` } } } : {}),
    },
    include: { student: true, trainer: true },
  });
}

const HOUR = 60 * 60 * 1000;

/**
 * A fresh cycle with `count` active courses whose enrollment windows are open now. Each course
 * also gets a unique code so tests can run against a shared database.
 */
export async function createOpenCycle(db: PrismaClient, count = 3) {
  const s = uid();
  const cycle = await db.trainingCycle.create({
    data: { name: `Open ${s}`, startsOn: new Date('2027-01-04'), endsOn: new Date('2027-04-30') },
  });
  const courses = [];
  for (let i = 0; i < count; i++) {
    courses.push(
      await db.course.create({
        data: {
          code: `O${i}-${s}`,
          title: `Open course ${i} ${s}`,
          description: 'Course with an open enrollment window',
          durationWeeks: 8,
          seatCapacity: 10,
          offerings: {
            create: {
              cycleId: cycle.id,
              isOpen: true,
              enrollmentOpensAt: new Date(Date.now() - HOUR),
              enrollmentClosesAt: new Date(Date.now() + 24 * HOUR),
            },
          },
        },
      }),
    );
  }
  return { cycle, courses };
}

/** Moves a course's window in a cycle: 'closed' (ended an hour ago), 'off' (toggle), 'upcoming'. */
export async function setWindow(
  db: PrismaClient,
  cycleId: string,
  courseId: string,
  state: 'closed' | 'off' | 'upcoming' | 'open',
) {
  const now = Date.now();
  const data = {
    closed: {
      isOpen: true,
      enrollmentOpensAt: new Date(now - 2 * HOUR),
      enrollmentClosesAt: new Date(now - HOUR),
    },
    off: {
      isOpen: false,
      enrollmentOpensAt: new Date(now - HOUR),
      enrollmentClosesAt: new Date(now + HOUR),
    },
    upcoming: {
      isOpen: true,
      enrollmentOpensAt: new Date(now + HOUR),
      enrollmentClosesAt: new Date(now + 2 * HOUR),
    },
    open: {
      isOpen: true,
      enrollmentOpensAt: new Date(now - HOUR),
      enrollmentClosesAt: new Date(now + 24 * HOUR),
    },
  }[state];
  await db.courseOffering.update({ where: { courseId_cycleId: { courseId, cycleId } }, data });
}

export async function createCycleCourseBatch(db: PrismaClient) {
  const s = uid();
  const cycle = await db.trainingCycle.create({
    data: { name: `Cycle ${s}`, startsOn: new Date('2027-01-04'), endsOn: new Date('2027-04-30') },
  });
  const course = await db.course.create({
    data: {
      code: `C-${s}`,
      title: `Course ${s}`,
      description: 'Test course',
      durationWeeks: 10,
      seatCapacity: 30,
    },
  });
  const batch = await db.batch.create({
    data: {
      courseId: course.id,
      cycleId: cycle.id,
      name: `Batch ${s}`,
      capacity: 25,
      startDate: new Date('2027-01-04'),
      endDate: new Date('2027-03-31'),
      venue: 'Workshop A',
    },
  });
  return { cycle, course, batch };
}
