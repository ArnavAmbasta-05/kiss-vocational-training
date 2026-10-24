import { Prisma } from '@prisma/client';
import type {
  CompetencyDto,
  PassportEntry,
  RevokedPassportEntry,
  CompetencyInput,
  CompetencyStanding,
  GapItem,
  Heatmap,
  LinkableAssessment,
  RatingGrid,
  RatingsSaveInput,
  ResourceDto,
  ResourceInput,
  Role,
  StudentGaps,
} from '@vtmp/shared';
import { withAudit, type Actor } from '../../core/audit';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';
import { settings } from '../../core/settings';
import * as assessments from '../assessments/assessments.service';
import * as batches from '../batches/batches.service';
import * as courses from '../courses/courses.service';
import * as enrollments from '../enrollments/enrollments.service';
import { canVerify, demonstrated, gap } from './rules';

/**
 * F12 and the shared competency model (BRD §9.1, §9.4). An innovation module: it reads core
 * data only through core services (batches, assessments, courses) and owns the competencies,
 * assessment links, ratings and learning resources tables.
 */

interface Viewer extends Actor {
  role: Role;
}

const competencyInclude = {
  assessments: { select: { assessmentId: true } },
  _count: { select: { ratings: true } },
  resources: { select: { approvedById: true } },
} satisfies Prisma.CompetencyInclude;
type CompetencyRow = Prisma.CompetencyGetPayload<{ include: typeof competencyInclude }>;

function toCompetency(c: CompetencyRow, linkable: Map<string, LinkableAssessment>): CompetencyDto {
  return {
    id: c.id,
    courseId: c.courseId,
    code: c.code,
    title: c.title,
    description: c.description,
    mode: c.mode,
    requiredLevel: c.requiredLevel,
    isMandatory: c.isMandatory,
    assessments: c.assessments
      .map((l) => linkable.get(l.assessmentId))
      .filter((a): a is LinkableAssessment => !!a)
      .map((a) => ({ id: a.id, title: a.title, batchName: a.batchName })),
    resourceCount: c.resources.filter((r) => r.approvedById !== null).length,
    ratingCount: c._count.ratings,
  };
}

async function requireCourse(courseId: string) {
  const course = (await courses.listCourses()).find((c) => c.id === courseId);
  if (!course) throw AppError.notFound('Course not found');
  return course;
}

async function linkableMap(courseId: string): Promise<Map<string, LinkableAssessment>> {
  return new Map((await assessments.ofCourse(courseId)).map((a) => [a.id, a]));
}

// ─── Competencies (BRQ-C.1) ────────────────────────────────────────────────────

export async function linkableAssessments(courseId: string): Promise<LinkableAssessment[]> {
  await requireCourse(courseId);
  return assessments.ofCourse(courseId);
}

export async function listCompetencies(courseId: string): Promise<CompetencyDto[]> {
  await requireCourse(courseId);
  const [rows, linkable] = await Promise.all([
    prisma().competency.findMany({
      where: { courseId },
      include: competencyInclude,
      orderBy: { code: 'asc' },
    }),
    linkableMap(courseId),
  ]);
  return rows.map((c) => toCompetency(c, linkable));
}

async function checkLinks(courseId: string, ids: string[]) {
  const linkable = await linkableMap(courseId);
  const foreign = ids.filter((id) => !linkable.has(id));
  if (foreign.length) {
    throw AppError.unprocessable(
      'ASSESSMENT_NOT_IN_COURSE',
      'Linked assessments must belong to a batch of this course',
      foreign.map((id) => ({ path: id, message: 'Not an assessment of this course' })),
    );
  }
  return linkable;
}

function codeTaken(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw AppError.conflict('COMPETENCY_CODE_TAKEN', 'This code is already used in the course');
  }
  throw err;
}

export async function createCompetency(
  actor: Actor,
  courseId: string,
  input: CompetencyInput,
): Promise<CompetencyDto> {
  await requireCourse(courseId);
  const linkable = await checkLinks(courseId, input.assessmentIds);
  const row = await withAudit(actor, async (tx, log) => {
    const c = await tx.competency.create({
      data: {
        courseId,
        code: input.code.toUpperCase(),
        title: input.title,
        description: input.description ?? null,
        mode: input.mode,
        requiredLevel: input.requiredLevel,
        isMandatory: input.isMandatory,
        assessments: { create: input.assessmentIds.map((assessmentId) => ({ assessmentId })) },
      },
      include: competencyInclude,
    });
    await log({
      action: 'COMPETENCY_CREATED',
      entity: 'Competency',
      entityId: c.id,
      newValue: { ...input, code: c.code, courseId },
    });
    return c;
  }).catch(codeTaken);
  return toCompetency(row, linkable);
}

export async function updateCompetency(
  actor: Actor,
  id: string,
  input: CompetencyInput,
): Promise<CompetencyDto> {
  const before = await prisma().competency.findUnique({
    where: { id },
    include: competencyInclude,
  });
  if (!before) throw AppError.notFound('Competency not found');
  const linkable = await checkLinks(before.courseId, input.assessmentIds);
  const row = await withAudit(actor, async (tx, log) => {
    await tx.assessmentCompetency.deleteMany({ where: { competencyId: id } });
    const c = await tx.competency.update({
      where: { id },
      data: {
        code: input.code.toUpperCase(),
        title: input.title,
        description: input.description ?? null,
        mode: input.mode,
        requiredLevel: input.requiredLevel,
        isMandatory: input.isMandatory,
        assessments: { create: input.assessmentIds.map((assessmentId) => ({ assessmentId })) },
      },
      include: competencyInclude,
    });
    await log({
      action: 'COMPETENCY_UPDATED',
      entity: 'Competency',
      entityId: id,
      oldValue: {
        code: before.code,
        title: before.title,
        mode: before.mode,
        requiredLevel: before.requiredLevel,
        isMandatory: before.isMandatory,
        assessmentIds: before.assessments.map((a) => a.assessmentId),
      },
      newValue: { ...input, code: c.code },
    });
    return c;
  }).catch(codeTaken);
  return toCompetency(row, linkable);
}

/** A competency with ratings is part of students' records and can't be deleted. */
export async function deleteCompetency(actor: Actor, id: string): Promise<void> {
  const c = await prisma().competency.findUnique({
    where: { id },
    include: { _count: { select: { ratings: true } } },
  });
  if (!c) throw AppError.notFound('Competency not found');
  if (c._count.ratings > 0) {
    throw AppError.conflict('HAS_RATINGS', 'Students have been rated on this competency');
  }
  await withAudit(actor, async (tx, log) => {
    await tx.competency.delete({ where: { id } });
    await log({
      action: 'COMPETENCY_DELETED',
      entity: 'Competency',
      entityId: id,
      oldValue: { code: c.code, title: c.title, courseId: c.courseId },
    });
  });
}

// ─── Learning resources (BRQ-12.3) ─────────────────────────────────────────────

const resourceInclude = {
  competency: { select: { code: true, title: true, courseId: true } },
  createdBy: { select: { fullName: true } },
  approvedBy: { select: { fullName: true } },
} satisfies Prisma.LearningResourceInclude;
type ResourceRow = Prisma.LearningResourceGetPayload<{ include: typeof resourceInclude }>;

function toResource(r: ResourceRow): ResourceDto {
  return {
    id: r.id,
    competencyId: r.competencyId,
    competencyCode: r.competency.code,
    competencyTitle: r.competency.title,
    title: r.title,
    type: r.type,
    url: r.url,
    createdBy: r.createdBy.fullName,
    approved: r.approvedById !== null,
    approvedBy: r.approvedBy?.fullName ?? null,
  };
}

export async function listResources(courseId: string): Promise<ResourceDto[]> {
  await requireCourse(courseId);
  const rows = await prisma().learningResource.findMany({
    where: { competency: { courseId } },
    include: resourceInclude,
    orderBy: [{ competency: { code: 'asc' } }, { title: 'asc' }],
  });
  return rows.map(toResource);
}

async function requireCompetency(id: string) {
  const c = await prisma().competency.findUnique({ where: { id } });
  if (!c) throw AppError.unprocessable('COMPETENCY_NOT_FOUND', 'No such competency');
  return c;
}

/** Admin additions count as curated at once; a trainer's wait for an admin's approval. */
export async function createResource(actor: Viewer, input: ResourceInput): Promise<ResourceDto> {
  await requireCompetency(input.competencyId);
  return withAudit(actor, async (tx, log) => {
    const r = await tx.learningResource.create({
      data: {
        ...input,
        createdById: actor.userId!,
        approvedById: actor.role === 'ADMIN' ? actor.userId : null,
      },
      include: resourceInclude,
    });
    await log({
      action: 'RESOURCE_CREATED',
      entity: 'LearningResource',
      entityId: r.id,
      newValue: { ...input, approved: r.approvedById !== null },
    });
    return toResource(r);
  });
}

async function editableResource(actor: Viewer, id: string) {
  const r = await prisma().learningResource.findUnique({ where: { id } });
  if (!r) throw AppError.notFound('Resource not found');
  if (actor.role !== 'ADMIN' && r.createdById !== actor.userId) throw AppError.forbidden();
  return r;
}

/** A trainer's edit sends the resource back for approval; an admin's keeps it approved. */
export async function updateResource(
  actor: Viewer,
  id: string,
  input: ResourceInput,
): Promise<ResourceDto> {
  const before = await editableResource(actor, id);
  await requireCompetency(input.competencyId);
  return withAudit(actor, async (tx, log) => {
    const r = await tx.learningResource.update({
      where: { id },
      data: { ...input, approvedById: actor.role === 'ADMIN' ? actor.userId : null },
      include: resourceInclude,
    });
    await log({
      action: 'RESOURCE_UPDATED',
      entity: 'LearningResource',
      entityId: id,
      oldValue: {
        competencyId: before.competencyId,
        title: before.title,
        type: before.type,
        url: before.url,
        approved: before.approvedById !== null,
      },
      newValue: { ...input, approved: r.approvedById !== null },
    });
    return toResource(r);
  });
}

export async function deleteResource(actor: Viewer, id: string): Promise<void> {
  const r = await editableResource(actor, id);
  await withAudit(actor, async (tx, log) => {
    await tx.learningResource.delete({ where: { id } });
    await log({
      action: 'RESOURCE_DELETED',
      entity: 'LearningResource',
      entityId: id,
      oldValue: { title: r.title, url: r.url, competencyId: r.competencyId },
    });
  });
}

export async function approveResource(actor: Actor, id: string): Promise<ResourceDto> {
  const r = await prisma().learningResource.findUnique({ where: { id } });
  if (!r) throw AppError.notFound('Resource not found');
  return withAudit(actor, async (tx, log) => {
    const updated = await tx.learningResource.update({
      where: { id },
      data: { approvedById: actor.userId },
      include: resourceInclude,
    });
    await log({
      action: 'RESOURCE_APPROVED',
      entity: 'LearningResource',
      entityId: id,
      oldValue: { approved: r.approvedById !== null },
      newValue: { approved: true },
    });
    return toResource(updated);
  });
}

// ─── Ratings (BRQ-C.2, BR-13) ──────────────────────────────────────────────────

const gridCompetency = (c: {
  id: string;
  code: string;
  title: string;
  mode: CompetencyDto['mode'];
  requiredLevel: number;
  isMandatory: boolean;
}) => ({
  id: c.id,
  code: c.code,
  title: c.title,
  mode: c.mode,
  requiredLevel: c.requiredLevel,
  isMandatory: c.isMandatory,
});

async function batchContext(batchId: string) {
  const batch = await batches.detail(batchId, 'ADMIN');
  const comps = await prisma().competency.findMany({
    where: { courseId: batch.courseId },
    orderBy: { code: 'asc' },
    include: { assessments: { select: { assessmentId: true } } },
  });
  const students = (batch.roster ?? []).map((r) => ({
    studentId: r.studentId,
    rollNo: r.rollNo,
    fullName: r.fullName,
  }));
  return { batch, comps, students };
}

export async function ratingGrid(viewer: Viewer, batchId: string): Promise<RatingGrid> {
  const { batch, comps, students } = await batchContext(batchId);
  const ratings = await prisma().competencyRating.findMany({ where: { batchId } });
  return {
    batchId,
    // BR-13: only the batch's own trainer rates and confirms (the route checks assignment).
    editable: viewer.role === 'TRAINER' && batch.status === 'ACTIVE',
    competencies: comps.map(gridCompetency),
    students,
    ratings: ratings.map((r) => ({
      studentId: r.studentId,
      competencyId: r.competencyId,
      level: r.level,
      verified: r.verifiedAt !== null && r.revokedAt === null,
      ratedAt: r.ratedAt.toISOString(),
    })),
  };
}

/**
 * Bulk ratings in one transaction (BRQ-C.2). `verify` confirms a rating as verified, allowed
 * only at or above the required level (BR-13, 422 BELOW_REQUIRED_LEVEL with every offending
 * cell). A verified rating can be raised but never taken below the required level (409
 * VERIFIED_LOCKED). Each new or changed rating is audited with old and new values.
 */
export async function saveRatings(
  actor: Actor,
  batchId: string,
  input: RatingsSaveInput,
): Promise<RatingGrid> {
  const { batch, comps, students } = await batchContext(batchId);
  if (batch.status !== 'ACTIVE') {
    throw AppError.conflict('BATCH_NOT_ACTIVE', 'Ratings are recorded while the batch is active');
  }
  const roster = new Set(students.map((s) => s.studentId));
  const byId = new Map(comps.map((c) => [c.id, c]));

  const strangers = input.ratings.filter((r) => !roster.has(r.studentId));
  if (strangers.length) {
    throw AppError.unprocessable(
      'NOT_IN_BATCH',
      'Some students are not in this batch',
      strangers.map((r) => ({ path: r.studentId, message: 'Not in this batch' })),
    );
  }
  const foreign = input.ratings.filter((r) => !byId.has(r.competencyId));
  if (foreign.length) {
    throw AppError.unprocessable(
      'COMPETENCY_NOT_IN_COURSE',
      "Some competencies don't belong to this batch's course",
      foreign.map((r) => ({ path: r.competencyId, message: 'Not a competency of this course' })),
    );
  }
  const tooLow = input.ratings.filter(
    (r) => r.verify && !canVerify(r.level, byId.get(r.competencyId)!.requiredLevel),
  );
  if (tooLow.length) {
    throw AppError.unprocessable(
      'BELOW_REQUIRED_LEVEL',
      'A competency can be verified only at or above its required level',
      tooLow.map((r) => ({
        path: `${r.studentId}:${r.competencyId}`,
        message: `Level ${r.level} is below the required ${byId.get(r.competencyId)!.requiredLevel}`,
      })),
    );
  }

  await withAudit(actor, async (tx, log) => {
    const existing = new Map(
      (await tx.competencyRating.findMany({ where: { batchId } })).map((r) => [
        `${r.studentId}:${r.competencyId}`,
        r,
      ]),
    );
    const now = new Date();
    const entries: Parameters<typeof log.many>[0] = [];
    for (const r of input.ratings) {
      const key = `${r.studentId}:${r.competencyId}`;
      const before = existing.get(key);
      const required = byId.get(r.competencyId)!.requiredLevel;
      // A verification an admin revoked (BR-14) no longer counts; the trainer may verify again.
      const wasVerified = !!before?.verifiedAt && !before.revokedAt;
      if (wasVerified && r.level < required) {
        throw AppError.conflict(
          'VERIFIED_LOCKED',
          'A verified competency cannot be rated below its required level',
        );
      }
      const verifyNow = !!r.verify && !wasVerified;
      if (before && before.level === r.level && !verifyNow) continue;

      const verification = verifyNow
        ? {
            verifiedAt: now,
            verifiedById: actor.userId,
            revokedAt: null,
            revokedById: null,
            revokedReason: null,
          }
        : {};
      const row = before
        ? await tx.competencyRating.update({
            where: { id: before.id },
            data: { level: r.level, ratedById: actor.userId!, ratedAt: now, ...verification },
          })
        : await tx.competencyRating.create({
            data: {
              batchId,
              studentId: r.studentId,
              competencyId: r.competencyId,
              level: r.level,
              ratedById: actor.userId!,
              ratedAt: now,
              ...verification,
            },
          });
      entries.push({
        action: verifyNow
          ? 'COMPETENCY_VERIFIED'
          : before
            ? 'COMPETENCY_RATING_UPDATED'
            : 'COMPETENCY_RATED',
        entity: 'CompetencyRating',
        entityId: row.id,
        oldValue: before ? { level: before.level, verified: wasVerified } : null,
        newValue: {
          studentId: r.studentId,
          competencyId: r.competencyId,
          level: r.level,
          verified: wasVerified || verifyNow,
        },
      });
    }
    if (entries.length) await log.many(entries);
  });
  return ratingGrid({ ...actor, role: 'TRAINER' }, batchId);
}

// ─── Standing and gaps (BRQ-12.1, 12.2, BR-18) ─────────────────────────────────

/** Every student's standing on every course competency in one batch, computed on read. */
async function standings(
  batchId: string,
  studentIds?: string[],
): Promise<{
  ctx: Awaited<ReturnType<typeof batchContext>>;
  byStudent: Map<string, CompetencyStanding[]>;
}> {
  const ctx = await batchContext(batchId);
  const ids = studentIds ?? ctx.students.map((s) => s.studentId);
  const [ratings, bands] = await Promise.all([
    prisma().competencyRating.findMany({ where: { batchId, studentId: { in: ids } } }),
    settings.get('competency.provisionalBands'),
  ]);
  const rated = new Map(ratings.map((r) => [`${r.studentId}:${r.competencyId}`, r]));
  const byStudent = new Map<string, CompetencyStanding[]>();
  await Promise.all(
    ids.map(async (studentId) => {
      const results = await assessments.studentResults(batchId, studentId);
      const percent = new Map(
        results.filter((r) => r.percent !== null).map((r) => [r.assessmentId, r.percent!]),
      );
      byStudent.set(
        studentId,
        ctx.comps.map((c) => {
          const rating = rated.get(`${studentId}:${c.id}`);
          const linked = c.assessments
            .map((a) => percent.get(a.assessmentId))
            .filter((p): p is number => p !== undefined);
          const d = demonstrated(rating?.level ?? null, linked, bands);
          return {
            competencyId: c.id,
            code: c.code,
            title: c.title,
            mode: c.mode,
            isMandatory: c.isMandatory,
            requiredLevel: c.requiredLevel,
            demonstratedLevel: d.level,
            source: d.source,
            verified: !!rating?.verifiedAt && !rating.revokedAt,
            gap: gap(c.requiredLevel, d.level),
          };
        }),
      );
    }),
  );
  return { ctx, byStudent };
}

/**
 * BRQ-12.1–12.3: a student's gaps in one batch (default: their latest), ranked by size, split
 * into assessed-but-below-level and not yet assessed, each with approved resources only.
 */
export async function studentGaps(studentId: string, batchId?: string): Promise<StudentGaps> {
  const placements = await batches.placementsOf(studentId);
  const p = batchId ? placements.find((x) => x.batch.id === batchId) : placements[0];
  if (!p) return { batch: null, belowLevel: [], notAssessed: [], met: [] };

  const { byStudent } = await standings(p.batch.id, [studentId]);
  const list = byStudent.get(studentId) ?? [];
  const open = list.filter((s) => s.gap > 0);
  const resources = await prisma().learningResource.findMany({
    where: { competencyId: { in: open.map((s) => s.competencyId) }, approvedById: { not: null } },
    orderBy: [{ type: 'asc' }, { title: 'asc' }],
    select: { id: true, competencyId: true, title: true, type: true, url: true },
  });
  const withResources = (s: CompetencyStanding): GapItem => ({
    ...s,
    recommendations: resources
      .filter((r) => r.competencyId === s.competencyId)
      .map(({ competencyId: _c, ...r }) => r),
  });
  // Largest gap first; mandatory before optional on a tie, then by code.
  const rank = (a: CompetencyStanding, b: CompetencyStanding) =>
    b.gap - a.gap || Number(b.isMandatory) - Number(a.isMandatory) || a.code.localeCompare(b.code);
  return {
    batch: { id: p.batch.id, name: p.batch.name, courseTitle: p.batch.courseTitle },
    belowLevel: open
      .filter((s) => s.source !== 'NOT_ASSESSED')
      .sort(rank)
      .map(withResources),
    notAssessed: open
      .filter((s) => s.source === 'NOT_ASSESSED')
      .sort(rank)
      .map(withResources),
    met: list.filter((s) => s.gap === 0),
  };
}

/** BRQ-12.4: students × competencies with level, source and gap; below-level cells flagged. */
export async function heatmap(batchId: string): Promise<Heatmap> {
  const { ctx, byStudent } = await standings(batchId);
  return {
    batchId,
    competencies: ctx.comps.map(gridCompetency),
    rows: ctx.students.map((s) => ({
      ...s,
      cells: (byStudent.get(s.studentId) ?? []).map((c) => ({
        competencyId: c.competencyId,
        level: c.demonstratedLevel,
        source: c.source,
        verified: c.verified,
        gap: c.gap,
        below: c.source !== 'NOT_ASSESSED' && c.gap > 0,
      })),
    })),
  };
}

/** For F11 (Sprint 10): mandatory competencies where the student is below the required level. */
export async function mandatoryGaps(
  studentId: string,
  batchId: string,
): Promise<CompetencyStanding[]> {
  const { byStudent } = await standings(batchId, [studentId]);
  return (byStudent.get(studentId) ?? []).filter((s) => s.isMandatory && s.gap > 0);
}

// ─── Passport support (F10: BRQ-10.1, 10.4, BR-14) ─────────────────────────────

/**
 * Every competency a trainer verified for this student, across all batches and cycles
 * (BRQ-10.4), split into active and revoked. Batch, course and cycle names come from the core
 * services, not their tables.
 */
export async function verifiedEntries(
  studentId: string,
): Promise<{ active: PassportEntry[]; revoked: RevokedPassportEntry[] }> {
  const [rows, placements] = await Promise.all([
    prisma().competencyRating.findMany({
      where: { studentId, verifiedAt: { not: null } },
      orderBy: { verifiedAt: 'desc' },
      include: {
        competency: { select: { code: true, title: true, mode: true, requiredLevel: true } },
        verifiedBy: { select: { fullName: true } },
      },
    }),
    batches.placementsOf(studentId),
  ]);
  const cycles = new Map(
    await Promise.all(
      placements.map(
        async (p) =>
          [
            p.batch.id,
            (await enrollments.placementFacts(p.enrollmentId))?.cycleName ?? '',
          ] as const,
      ),
    ),
  );
  const byBatch = new Map(placements.map((p) => [p.batch.id, p.batch]));
  const entry = (r: (typeof rows)[number]): PassportEntry => ({
    ratingId: r.id,
    competencyId: r.competencyId,
    code: r.competency.code,
    title: r.competency.title,
    mode: r.competency.mode,
    level: r.level,
    requiredLevel: r.competency.requiredLevel,
    courseTitle: byBatch.get(r.batchId)?.courseTitle ?? '',
    batchName: byBatch.get(r.batchId)?.name ?? '',
    cycleName: cycles.get(r.batchId) ?? '',
    verifiedAt: r.verifiedAt!.toISOString(),
    verifiedBy: r.verifiedBy?.fullName ?? '',
  });
  return {
    active: rows.filter((r) => !r.revokedAt).map(entry),
    revoked: rows
      .filter((r) => r.revokedAt)
      .map((r) => ({
        ...entry(r),
        revokedAt: r.revokedAt!.toISOString(),
        revokedReason: r.revokedReason ?? '',
      })),
  };
}

/** BR-14: an admin revokes a verified competency with a reason; the entry is kept and logged. */
export async function revokeVerification(actor: Actor, ratingId: string, reason: string) {
  const r = await prisma().competencyRating.findUnique({ where: { id: ratingId } });
  if (!r) throw AppError.notFound('Rating not found');
  if (!r.verifiedAt || r.revokedAt) {
    throw AppError.conflict('NOT_VERIFIED', 'Only a verified, unrevoked competency can be revoked');
  }
  await withAudit(actor, async (tx, log) => {
    await tx.competencyRating.update({
      where: { id: ratingId },
      data: { revokedAt: new Date(), revokedById: actor.userId, revokedReason: reason },
    });
    await log({
      action: 'COMPETENCY_VERIFICATION_REVOKED',
      entity: 'CompetencyRating',
      entityId: ratingId,
      oldValue: { verified: true, level: r.level },
      newValue: { verified: false, reason },
    });
  });
  return { ratingId, revoked: true };
}
