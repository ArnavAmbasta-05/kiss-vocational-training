import type { Request, RequestHandler } from 'express';
import { prisma } from '../db';
import { AppError } from '../errors';

export type OwnershipResult = 'allow' | 'forbidden' | 'not_found';
export type CurrentUser = NonNullable<Request['user']>;

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ─── Predicates (reused by services in later sprints) ─────────────────────────

/** BR-05: is this trainer assigned to this batch? */
export async function trainerOwnsBatch(trainerId: string, batchId: string): Promise<boolean> {
  const row = await prisma().trainerAssignment.findUnique({
    where: { batchId_trainerId: { batchId, trainerId } },
    select: { batchId: true },
  });
  return row !== null;
}

/** Does this trainer teach any batch this student belongs to? */
export async function trainerTeachesStudent(
  trainerId: string,
  studentId: string,
): Promise<boolean> {
  const count = await prisma().batchStudent.count({
    where: { studentId, batch: { trainers: { some: { trainerId } } } },
  });
  return count > 0;
}

async function studentInBatch(studentId: string, batchId: string): Promise<boolean> {
  const row = await prisma().batchStudent.findUnique({
    where: { batchId_studentId: { batchId, studentId } },
    select: { id: true },
  });
  return row !== null;
}

// ─── Resolvers: unknown id → not_found, someone else's → forbidden ────────────

/** A student's own record; their trainers and admins may also read it. */
export async function isOwnStudent(user: CurrentUser, studentId: string): Promise<OwnershipResult> {
  if (!isUuid(studentId)) return 'not_found';
  const exists = await prisma().student.findUnique({
    where: { id: studentId },
    select: { id: true },
  });
  if (!exists) return 'not_found';
  if (user.role === 'ADMIN') return 'allow';
  if (user.role === 'STUDENT') return user.studentId === studentId ? 'allow' : 'forbidden';
  return user.trainerId && (await trainerTeachesStudent(user.trainerId, studentId))
    ? 'allow'
    : 'forbidden';
}

/** Admin: any batch. Trainer: assigned batches only (BR-05). Student: batches they are in. */
export async function canAccessBatch(user: CurrentUser, batchId: string): Promise<OwnershipResult> {
  if (!isUuid(batchId)) return 'not_found';
  const exists = await prisma().batch.findUnique({ where: { id: batchId }, select: { id: true } });
  if (!exists) return 'not_found';
  if (user.role === 'ADMIN') return 'allow';
  if (user.role === 'TRAINER') {
    return user.trainerId && (await trainerOwnsBatch(user.trainerId, batchId))
      ? 'allow'
      : 'forbidden';
  }
  return user.studentId && (await studentInBatch(user.studentId, batchId)) ? 'allow' : 'forbidden';
}

export async function canAccessSession(
  user: CurrentUser,
  sessionId: string,
): Promise<OwnershipResult> {
  if (!isUuid(sessionId)) return 'not_found';
  const session = await prisma().trainingSession.findUnique({
    where: { id: sessionId },
    select: { batchId: true },
  });
  return session ? canAccessBatch(user, session.batchId) : 'not_found';
}

export async function canAccessAssessment(
  user: CurrentUser,
  assessmentId: string,
): Promise<OwnershipResult> {
  if (!isUuid(assessmentId)) return 'not_found';
  const assessment = await prisma().assessment.findUnique({
    where: { id: assessmentId },
    select: { batchId: true },
  });
  return assessment ? canAccessBatch(user, assessment.batchId) : 'not_found';
}

/** An application: its own student, that student's trainers, and admins. */
export async function canAccessEnrollment(
  user: CurrentUser,
  enrollmentId: string,
): Promise<OwnershipResult> {
  if (!isUuid(enrollmentId)) return 'not_found';
  const enrollment = await prisma().enrollment.findUnique({
    where: { id: enrollmentId },
    select: { studentId: true },
  });
  return enrollment ? isOwnStudent(user, enrollment.studentId) : 'not_found';
}

/** A certificate: its own student or an admin only (TC-17). Trainers don't download them. */
export async function canAccessCertificate(
  user: CurrentUser,
  certificateId: string,
): Promise<OwnershipResult> {
  if (!isUuid(certificateId)) return 'not_found';
  const c = await prisma().certificate.findUnique({
    where: { id: certificateId },
    select: { enrollment: { select: { studentId: true } } },
  });
  if (!c) return 'not_found';
  if (user.role === 'ADMIN') return 'allow';
  return user.role === 'STUDENT' && user.studentId === c.enrollment.studentId
    ? 'allow'
    : 'forbidden';
}

// ─── Middleware ────────────────────────────────────────────────────────────────

export type Resolver = (req: Request) => Promise<OwnershipResult>;

/** Runs after authenticate + authorize. Not yours → 403; unknown → 404. */
export function requireOwnership(resolver: Resolver): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    resolver(req)
      .then((result) => {
        if (result === 'allow') return next();
        next(result === 'not_found' ? AppError.notFound() : AppError.forbidden());
      })
      .catch(next);
  };
}

function param(req: Request, name: string): string {
  return String(req.params[name] ?? '');
}

/** Ready-made resolvers keyed on a route param, e.g. `requireOwnership(owns.batch('id'))`. */
export const owns = {
  /** Accepts "me" for the signed-in student. */
  student:
    (name = 'studentId'): Resolver =>
    (req) => {
      const value = param(req, name);
      const id = value === 'me' ? (req.user!.studentId ?? '') : value;
      return isOwnStudent(req.user!, id);
    },
  batch:
    (name = 'batchId'): Resolver =>
    (req) =>
      canAccessBatch(req.user!, param(req, name)),
  session:
    (name = 'sessionId'): Resolver =>
    (req) =>
      canAccessSession(req.user!, param(req, name)),
  assessment:
    (name = 'assessmentId'): Resolver =>
    (req) =>
      canAccessAssessment(req.user!, param(req, name)),
  enrollment:
    (name = 'enrollmentId'): Resolver =>
    (req) =>
      canAccessEnrollment(req.user!, param(req, name)),
  certificate:
    (name = 'certificateId'): Resolver =>
    (req) =>
      canAccessCertificate(req.user!, param(req, name)),
};
