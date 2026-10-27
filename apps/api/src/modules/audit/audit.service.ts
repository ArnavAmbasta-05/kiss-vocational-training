import type { Prisma } from '@prisma/client';
import type { AuditFacets, AuditLogRow, AuditQuery, Paginated } from '@vtmp/shared';
import { prisma } from '../../core/db';
import { paginated } from '../../core/http';
import { toCsv } from '../reports/csv';
import * as users from '../users/users.service';

/** The export is capped so it fits one serverless response; filter to narrow it down. */
export const EXPORT_LIMIT = 10_000;

const DAY_MS = 86_400_000;

function whereOf(q: Omit<AuditQuery, 'page' | 'pageSize'>): Prisma.AuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (q.from) createdAt.gte = new Date(`${q.from}T00:00:00Z`);
  // `to` is an inclusive day: everything before the next midnight.
  if (q.to) createdAt.lt = new Date(new Date(`${q.to}T00:00:00Z`).getTime() + DAY_MS);
  return {
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.entity ? { entity: q.entity } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.from || q.to ? { createdAt } : {}),
  };
}

type Row = Prisma.AuditLogGetPayload<object>;

async function toRows(rows: Row[]): Promise<AuditLogRow[]> {
  const people = await users.userIdentities(
    rows.map((r) => r.userId).filter((u): u is string => u !== null),
  );
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    user: r.userId ? (people.get(r.userId) ?? null) : null,
    oldValue: r.oldValue ?? null,
    newValue: r.newValue ?? null,
    ip: r.ip,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** BRQ-19.2: newest first, filtered by user, entity, record, action and date. Read-only. */
export async function list(q: AuditQuery): Promise<Paginated<AuditLogRow>> {
  const where = whereOf(q);
  const skip = (q.page - 1) * q.pageSize;
  const [rows, total] = await Promise.all([
    prisma().auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: q.pageSize,
    }),
    prisma().auditLog.count({ where }),
  ]);
  return paginated(await toRows(rows), total, {
    page: q.page,
    pageSize: q.pageSize,
    skip,
    take: q.pageSize,
  });
}

/**
 * Entities and actions present in the log, for the viewer's filters. The log only grows, so
 * instead of grouping every row this hops from one distinct value to the next through the
 * (entity, …) and (action, …) indexes: a few dozen index lookups at any table size.
 */
export async function facets(): Promise<AuditFacets> {
  const [entities, actions] = await Promise.all([
    prisma().$queryRaw<Array<{ v: string }>>`
      WITH RECURSIVE t(v) AS (
        (SELECT entity FROM audit_logs ORDER BY entity LIMIT 1)
        UNION ALL
        SELECT (SELECT entity FROM audit_logs WHERE entity > t.v ORDER BY entity LIMIT 1)
        FROM t WHERE t.v IS NOT NULL
      )
      SELECT v FROM t WHERE v IS NOT NULL`,
    prisma().$queryRaw<Array<{ v: string }>>`
      WITH RECURSIVE t(v) AS (
        (SELECT action FROM audit_logs ORDER BY action LIMIT 1)
        UNION ALL
        SELECT (SELECT action FROM audit_logs WHERE action > t.v ORDER BY action LIMIT 1)
        FROM t WHERE t.v IS NOT NULL
      )
      SELECT v FROM t WHERE v IS NOT NULL`,
  ]);
  return { entities: entities.map((e) => e.v), actions: actions.map((a) => a.v) };
}

/** The same filters as CSV, newest first, at most EXPORT_LIMIT rows. */
export async function exportCsv(
  q: Omit<AuditQuery, 'page' | 'pageSize'>,
): Promise<{ body: string; truncated: boolean }> {
  const rows = await prisma().auditLog.findMany({
    where: whereOf(q),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: EXPORT_LIMIT + 1,
  });
  const truncated = rows.length > EXPORT_LIMIT;
  const list = await toRows(rows.slice(0, EXPORT_LIMIT));
  const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));
  const body = toCsv(
    [
      'Time (UTC)',
      'User',
      'Email',
      'Action',
      'Entity',
      'Entity ID',
      'Old value',
      'New value',
      'IP',
    ],
    list.map((r) => [
      r.createdAt,
      r.user?.fullName ?? 'System',
      r.user?.email ?? null,
      r.action,
      r.entity,
      r.entityId,
      json(r.oldValue),
      json(r.newValue),
      r.ip,
    ]),
  );
  return { body, truncated };
}
