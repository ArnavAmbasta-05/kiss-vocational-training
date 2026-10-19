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
