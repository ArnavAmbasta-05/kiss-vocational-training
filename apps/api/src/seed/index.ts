import bcrypt from 'bcrypt';
import { Role, type PrismaClient } from '@prisma/client';
import { SETTINGS, SETTING_KEYS } from '../core/settings/registry';
import { ADMIN, COURSES, SEED_PASSWORD, TRAINERS, makeStudents } from './data';

export const DEFAULT_STUDENTS = 60;
export const LARGE_STUDENTS = 500;
const BCRYPT_COST = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeedOptions {
  /** Seed 500 students instead of 60 (BO-3 allocation timing test). */
  large?: boolean;
  log?: (message: string) => void;
}

/**
 * Idempotent: every write is an upsert or createMany(skipDuplicates), so running it again only
 * fills in what is missing. It never overwrites a Setting an admin has changed.
 */
export async function runSeed(prisma: PrismaClient, opts: SeedOptions = {}) {
  const log = opts.log ?? (() => undefined);
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_COST);

  // Settings: insert defaults only for keys that have no row yet.
  const settings = await prisma.setting.createMany({
    data: SETTING_KEYS.map((key) => ({ key, value: SETTINGS[key].default as never })),
    skipDuplicates: true,
  });
  log(`settings: ${settings.count} added (${SETTING_KEYS.length} defined)`);

  await prisma.user.upsert({
    where: { email: ADMIN.email },
    create: { email: ADMIN.email, fullName: ADMIN.fullName, role: Role.ADMIN, passwordHash },
    update: {},
  });
  log('admin: 1');

  for (const t of TRAINERS) {
    await prisma.user.upsert({
      where: { email: t.email },
      create: {
        email: t.email,
        fullName: t.fullName,
        role: Role.TRAINER,
        passwordHash,
        trainer: { create: { employeeCode: t.employeeCode, specialization: t.specialization } },
      },
      update: {},
    });
  }
  log(`trainers: ${TRAINERS.length}`);

  const students = makeStudents(opts.large ? LARGE_STUDENTS : DEFAULT_STUDENTS);
  await prisma.user.createMany({
    data: students.map((s) => ({
      email: s.email,
      fullName: s.fullName,
      role: Role.STUDENT,
      passwordHash,
    })),
    skipDuplicates: true,
  });
  const users = await prisma.user.findMany({
    where: { email: { in: students.map((s) => s.email) } },
    select: { id: true, email: true },
  });
  const userIdByEmail = new Map(users.map((u) => [u.email, u.id]));
  await prisma.student.createMany({
    data: students.map((s) => ({
      userId: userIdByEmail.get(s.email)!,
      rollNo: s.rollNo,
      cgpa: s.cgpa,
      phone: s.phone,
    })),
    skipDuplicates: true,
  });
  log(`students: ${students.length}`);

  const now = new Date();
  const year = now.getUTCFullYear();
  const cycle = await prisma.trainingCycle.upsert({
    where: { name: `${year}-${String(year + 1).slice(2)} Cycle 1` },
    create: {
      name: `${year}-${String(year + 1).slice(2)} Cycle 1`,
      startsOn: new Date(now.getTime() + 35 * DAY_MS),
      endsOn: new Date(now.getTime() + 35 * DAY_MS + 16 * 7 * DAY_MS),
    },
    update: {},
  });
  log(`cycle: ${cycle.name}`);

  for (const c of COURSES) {
    const course = await prisma.course.upsert({
      where: { code: c.code },
      create: { ...c },
      update: {},
    });
    const existing = await prisma.courseOffering.findUnique({
      where: { courseId_cycleId: { courseId: course.id, cycleId: cycle.id } },
    });
    if (!existing) {
      await prisma.courseOffering.create({
        data: {
          courseId: course.id,
          cycleId: cycle.id,
          enrollmentOpensAt: new Date(now.getTime() - DAY_MS),
          enrollmentClosesAt: new Date(now.getTime() + 30 * DAY_MS),
          isOpen: true,
        },
      });
    } else if (existing.enrollmentClosesAt < now) {
      // Keep the demo usable: a re-seed reopens a window that has lapsed on a dev machine.
      await prisma.courseOffering.update({
        where: { id: existing.id },
        data: { enrollmentClosesAt: new Date(now.getTime() + 30 * DAY_MS), isOpen: true },
      });
    }
  }
  log(`courses: ${COURSES.length} with open enrollment windows`);

  return { students: students.length, trainers: TRAINERS.length, courses: COURSES.length };
}
