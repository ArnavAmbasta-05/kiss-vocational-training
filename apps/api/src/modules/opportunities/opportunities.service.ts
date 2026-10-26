import type { Prisma } from '@prisma/client';
import type {
  InterestedStudent,
  JobRoleDto,
  JobRoleInput,
  OpportunityDto,
  OpportunityInput,
  OpportunityListQuery,
  OpportunityMatch,
  Paginated,
} from '@vtmp/shared';
import { withAudit, type Actor } from '../../core/audit';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';
import { paginated } from '../../core/http';
import { settings } from '../../core/settings';
import { toCsv } from '../reports/csv';
import * as competency from '../competency/competency.service';
import * as users from '../users/users.service';
import { evaluateRole, rankMatches } from './rules';

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Today's calendar date at the institution (IST), for "closes on" comparisons. */
async function today(): Promise<string> {
  const offset = await settings.get('institution.utcOffsetMinutes');
  return new Date(Date.now() + offset * 60_000).toISOString().slice(0, 10);
}

// ─── Job roles (BRQ-C.3) ───────────────────────────────────────────────────────

const roleInclude = {
  competencies: { orderBy: { competencyCode: 'asc' } },
  _count: { select: { opportunities: true } },
} as const;
type RoleRow = Prisma.JobRoleGetPayload<{ include: typeof roleInclude }>;

async function toRoles(rows: RoleRow[]): Promise<JobRoleDto[]> {
  const titles = await competency.titlesByCode(
    rows.flatMap((r) => r.competencies.map((c) => c.competencyCode)),
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    isActive: r.isActive,
    competencies: r.competencies.map((c) => ({
      code: c.competencyCode,
      level: c.level,
      title: titles.get(c.competencyCode) ?? null,
    })),
    opportunityCount: r._count.opportunities,
  }));
}

export async function listRoles(): Promise<JobRoleDto[]> {
  return toRoles(
    await prisma().jobRole.findMany({ orderBy: { title: 'asc' }, include: roleInclude }),
  );
}

async function roleTitleTaken(title: string, exceptId?: string) {
  const other = await prisma().jobRole.findFirst({
    where: {
      title: { equals: title, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (other)
    throw AppError.conflict('ROLE_TITLE_TAKEN', 'A job role with this title already exists');
}

export async function createRole(actor: Actor, input: JobRoleInput): Promise<JobRoleDto> {
  await roleTitleTaken(input.title);
  const id = await withAudit(actor, async (tx, log) => {
    const role = await tx.jobRole.create({
      data: {
        title: input.title,
        description: input.description || null,
        isActive: input.isActive ?? true,
        competencies: {
          create: input.competencies.map((c) => ({ competencyCode: c.code, level: c.level })),
        },
      },
    });
    await log({
      action: 'JOB_ROLE_CREATED',
      entity: 'JobRole',
      entityId: role.id,
      newValue: input,
    });
    return role.id;
  });
  return (
    await toRoles([
      await prisma().jobRole.findUniqueOrThrow({ where: { id }, include: roleInclude }),
    ])
  )[0]!;
}

export async function updateRole(
  actor: Actor,
  id: string,
  input: JobRoleInput,
): Promise<JobRoleDto> {
  const before = await prisma().jobRole.findUnique({ where: { id }, include: roleInclude });
  if (!before) throw AppError.notFound('Job role not found');
  await roleTitleTaken(input.title, id);
  await withAudit(actor, async (tx, log) => {
    await tx.jobRoleCompetency.deleteMany({ where: { roleId: id } });
    await tx.jobRole.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description || null,
        isActive: input.isActive ?? before.isActive,
        competencies: {
          create: input.competencies.map((c) => ({ competencyCode: c.code, level: c.level })),
        },
      },
    });
    await log({
      action: 'JOB_ROLE_UPDATED',
      entity: 'JobRole',
      entityId: id,
      oldValue: {
        title: before.title,
        isActive: before.isActive,
        competencies: before.competencies.map((c) => ({ code: c.competencyCode, level: c.level })),
      },
      newValue: input,
    });
  });
  return (
    await toRoles([
      await prisma().jobRole.findUniqueOrThrow({ where: { id }, include: roleInclude }),
    ])
  )[0]!;
}

// ─── Opportunities (BRQ-13.1) ──────────────────────────────────────────────────

const oppInclude = {
  role: { select: { id: true, title: true } },
  _count: { select: { interests: true } },
} as const;
type OppRow = Prisma.OpportunityGetPayload<{ include: typeof oppInclude }>;

function toOpp(o: OppRow, todayIso: string): OpportunityDto {
  return {
    id: o.id,
    role: o.role,
    title: o.title,
    type: o.type,
    partner: o.partner,
    location: o.location,
    description: o.description,
    closesOn: day(o.closesOn),
    isActive: o.isActive,
    isOpen: o.isActive && day(o.closesOn) >= todayIso,
    interestedCount: o._count.interests,
  };
}

export async function listOpportunities(
  q: OpportunityListQuery,
): Promise<Paginated<OpportunityDto>> {
  const t = await today();
  const todayDate = new Date(`${t}T00:00:00Z`);
  const where: Prisma.OpportunityWhereInput =
    q.status === 'OPEN'
      ? { isActive: true, closesOn: { gte: todayDate } }
      : q.status === 'CLOSED'
        ? { OR: [{ isActive: false }, { closesOn: { lt: todayDate } }] }
        : {};
  const skip = (q.page - 1) * q.pageSize;
  const [rows, total] = await Promise.all([
    prisma().opportunity.findMany({
      where,
      orderBy: [{ closesOn: 'asc' }, { title: 'asc' }],
      include: oppInclude,
      skip,
      take: q.pageSize,
    }),
    prisma().opportunity.count({ where }),
  ]);
  return paginated(
    rows.map((o) => toOpp(o, t)),
    total,
    { page: q.page, pageSize: q.pageSize, skip, take: q.pageSize },
  );
}

async function checkRole(roleId: string) {
  const role = await prisma().jobRole.findUnique({ where: { id: roleId }, select: { id: true } });
  if (!role) {
    throw AppError.unprocessable('ROLE_NOT_FOUND', 'Choose an existing job role', [
      { path: 'roleId', message: 'Unknown job role' },
    ]);
  }
}

const oppData = (input: OpportunityInput) => ({
  roleId: input.roleId,
  title: input.title,
  type: input.type,
  partner: input.partner,
  location: input.location || null,
  description: input.description || null,
  closesOn: new Date(`${input.closesOn}T00:00:00Z`),
});

export async function createOpportunity(
  actor: Actor,
  input: OpportunityInput,
): Promise<OpportunityDto> {
  await checkRole(input.roleId);
  const id = await withAudit(actor, async (tx, log) => {
    const o = await tx.opportunity.create({
      data: { ...oppData(input), isActive: input.isActive ?? true, createdById: actor.userId! },
    });
    await log({
      action: 'OPPORTUNITY_CREATED',
      entity: 'Opportunity',
      entityId: o.id,
      newValue: input,
    });
    return o.id;
  });
  return toOpp(
    await prisma().opportunity.findUniqueOrThrow({ where: { id }, include: oppInclude }),
    await today(),
  );
}

export async function updateOpportunity(
  actor: Actor,
  id: string,
  input: OpportunityInput,
): Promise<OpportunityDto> {
  const before = await prisma().opportunity.findUnique({ where: { id } });
  if (!before) throw AppError.notFound('Opportunity not found');
  await checkRole(input.roleId);
  await withAudit(actor, async (tx, log) => {
    await tx.opportunity.update({
      where: { id },
      data: { ...oppData(input), isActive: input.isActive ?? before.isActive },
    });
    await log({
      action: 'OPPORTUNITY_UPDATED',
      entity: 'Opportunity',
      entityId: id,
      oldValue: { ...before, closesOn: day(before.closesOn) },
      newValue: input,
    });
  });
  return toOpp(
    await prisma().opportunity.findUniqueOrThrow({ where: { id }, include: oppInclude }),
    await today(),
  );
}

// ─── Matching (BR-22, BRQ-13.2–13.4) ───────────────────────────────────────────

/** Highest verified level per competency code (upper-case) across all of a student's cycles. */
async function verifiedLevels(studentId: string): Promise<Map<string, number>> {
  const { active } = await competency.verifiedEntries(studentId);
  const out = new Map<string, number>();
  for (const e of active) {
    const code = e.code.toUpperCase();
    out.set(code, Math.max(out.get(code) ?? 0, e.level));
  }
  return out;
}

/**
 * GET /students/me/matches: every open opportunity ranked by match % against the student's
 * passport, with the skills still missing and approved resources to close them (from F12).
 */
export async function matches(studentId: string): Promise<OpportunityMatch[]> {
  const t = await today();
  const [opps, levels, gaps, mine] = await Promise.all([
    prisma().opportunity.findMany({
      where: {
        isActive: true,
        closesOn: { gte: new Date(`${t}T00:00:00Z`) },
        role: { isActive: true },
      },
      include: { ...oppInclude, role: { select: { id: true, title: true, competencies: true } } },
    }),
    verifiedLevels(studentId),
    competency.studentGaps(studentId),
    prisma().opportunityInterest.findMany({
      where: { studentId },
      select: { opportunityId: true },
    }),
  ]);
  const interested = new Set(mine.map((m) => m.opportunityId));
  const titles = await competency.titlesByCode(
    opps.flatMap((o) => o.role.competencies.map((c) => c.competencyCode)),
  );
  const resources = new Map(
    [...gaps.belowLevel, ...gaps.notAssessed].map((g) => [g.code.toUpperCase(), g.recommendations]),
  );

  const list = opps.map((o) => {
    const r = evaluateRole(
      o.role.competencies.map((c) => ({ code: c.competencyCode, level: c.level })),
      levels,
    );
    const dto = toOpp({ ...o, role: { id: o.role.id, title: o.role.title } }, t);
    return {
      opportunity: dto,
      matchPercent: r.percent,
      verified: r.verified,
      required: r.required,
      missing: r.missing.map((m) => ({
        ...m,
        title: titles.get(m.code) ?? null,
        resources: (resources.get(m.code) ?? []).map((x) => ({
          id: x.id,
          title: x.title,
          type: x.type,
          url: x.url,
        })),
      })),
      interested: interested.has(o.id),
      // For ranking only.
      closesOn: dto.closesOn,
      title: dto.title,
    };
  });
  return rankMatches(list).map(({ closesOn: _c, title: _t, ...m }) => m);
}

async function openOpportunity(id: string) {
  const o = await prisma().opportunity.findUnique({ where: { id } });
  if (!o) throw AppError.notFound('Opportunity not found');
  if (!o.isActive || day(o.closesOn) < (await today())) {
    throw AppError.conflict('OPPORTUNITY_CLOSED', 'This opportunity is no longer open');
  }
  return o;
}

/** BRQ-13.4: the student marks interest (idempotent). */
export async function markInterest(actor: Actor, studentId: string, opportunityId: string) {
  await openOpportunity(opportunityId);
  const existing = await prisma().opportunityInterest.findUnique({
    where: { opportunityId_studentId: { opportunityId, studentId } },
  });
  if (existing) return { interested: true };
  await withAudit(actor, async (tx, log) => {
    await tx.opportunityInterest.create({ data: { opportunityId, studentId } });
    await log({
      action: 'OPPORTUNITY_INTEREST_ADDED',
      entity: 'Opportunity',
      entityId: opportunityId,
      newValue: { studentId },
    });
  });
  return { interested: true };
}

export async function withdrawInterest(actor: Actor, studentId: string, opportunityId: string) {
  const existing = await prisma().opportunityInterest.findUnique({
    where: { opportunityId_studentId: { opportunityId, studentId } },
  });
  if (!existing) return { interested: false };
  await withAudit(actor, async (tx, log) => {
    await tx.opportunityInterest.delete({
      where: { opportunityId_studentId: { opportunityId, studentId } },
    });
    await log({
      action: 'OPPORTUNITY_INTEREST_WITHDRAWN',
      entity: 'Opportunity',
      entityId: opportunityId,
      oldValue: { studentId },
    });
  });
  return { interested: false };
}

/** BRQ-13.4: interested students with their current match %, best match first. */
export async function interested(opportunityId: string): Promise<InterestedStudent[]> {
  const o = await prisma().opportunity.findUnique({
    where: { id: opportunityId },
    include: { role: { select: { competencies: true } } },
  });
  if (!o) throw AppError.notFound('Opportunity not found');
  const rows = await prisma().opportunityInterest.findMany({
    where: { opportunityId },
    orderBy: { createdAt: 'asc' },
  });
  const students = await users.studentSummaries(rows.map((r) => r.studentId));
  const emails = await users.userIdentities([...students.values()].map((s) => s.userId));
  const requirements = o.role.competencies.map((c) => ({ code: c.competencyCode, level: c.level }));
  const out: InterestedStudent[] = [];
  for (const r of rows) {
    const s = students.get(r.studentId);
    if (!s) continue;
    out.push({
      studentId: r.studentId,
      fullName: s.fullName,
      rollNo: s.rollNo,
      email: emails.get(s.userId)?.email ?? '',
      matchPercent: evaluateRole(requirements, await verifiedLevels(r.studentId)).percent,
      interestedAt: r.createdAt.toISOString(),
    });
  }
  return out.sort(
    (a, b) => b.matchPercent - a.matchPercent || a.fullName.localeCompare(b.fullName),
  );
}

export async function interestedCsv(
  opportunityId: string,
): Promise<{ body: string; filename: string }> {
  const list = await interested(opportunityId);
  const o = await prisma().opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
  const slug = o.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return {
    filename: `interested-${slug || 'opportunity'}.csv`,
    body: toCsv(
      ['Roll no', 'Name', 'Email', 'Match %', 'Interested on'],
      list.map((s) => [s.rollNo, s.fullName, s.email, s.matchPercent, s.interestedAt.slice(0, 10)]),
    ),
  };
}
