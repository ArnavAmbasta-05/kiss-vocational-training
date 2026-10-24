import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../db';

export interface AuditEntry {
  /** Acting user; null for system jobs (e.g. the nightly risk evaluation). */
  userId: string | null;
  /** UPPER_SNAKE verb, e.g. ENROLLMENT_APPROVED, ATTENDANCE_EDITED, SETTING_UPDATED. */
  action: string;
  /** Model name, e.g. Enrollment, Attendance, Setting. */
  entity: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
}

/** Converts Dates, Decimals and BigInts into plain JSON so snapshots are stable. */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as Prisma.InputJsonValue;
}

function assertTransactionClient(tx: Tx): void {
  // The root client exposes $transaction; an interactive transaction client does not.
  if (typeof (tx as unknown as { $transaction?: unknown }).$transaction === 'function') {
    throw new Error(
      'audit.record must be called with the transaction client so the change and its audit row commit together',
    );
  }
}

/**
 * Writes one AuditLog row inside the caller's transaction (CLAUDE.md rule 3, BR-12).
 * Passing the root Prisma client is a programming error and throws.
 */
async function record(tx: Tx, entry: AuditEntry): Promise<void> {
  assertTransactionClient(tx);
  await tx.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      oldValue: toJson(entry.oldValue),
      newValue: toJson(entry.newValue),
      ip: entry.ip ?? null,
    },
  });
}

/** Writes many audit rows in one insert, inside the caller's transaction (bulk operations). */
async function recordMany(tx: Tx, entries: AuditEntry[]): Promise<void> {
  assertTransactionClient(tx);
  if (entries.length === 0) return;
  await tx.auditLog.createMany({
    data: entries.map((entry) => ({
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      oldValue: toJson(entry.oldValue),
      newValue: toJson(entry.newValue),
      ip: entry.ip ?? null,
    })),
  });
}

type ActorEntry = Omit<AuditEntry, 'userId' | 'ip'>;

/** Audit logger bound to the acting user: log(entry), or log.many(entries) for bulk changes. */
export type AuditFn = ((entry: ActorEntry) => Promise<void>) & {
  many: (entries: ActorEntry[]) => Promise<void>;
};

export interface Actor {
  userId: string | null;
  ip?: string | null;
}

/**
 * Runs fn in one transaction with an audit logger bound to the actor:
 *
 *   await withAudit({ userId }, async (tx, log) => {
 *     const updated = await tx.enrollment.update(...);
 *     await log({ action: 'ENROLLMENT_APPROVED', entity: 'Enrollment', entityId: id, oldValue, newValue: updated });
 *   });
 *
 * If fn or any audit write throws, nothing is committed (NFR-05).
 */
export async function withAudit<T>(
  actor: Actor,
  fn: (tx: Tx, log: AuditFn) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T> {
  return prisma().$transaction(
    (tx) => {
      const bind = (entry: ActorEntry): AuditEntry => ({
        ...entry,
        userId: actor.userId,
        ip: actor.ip,
      });
      const log = Object.assign((entry: ActorEntry) => record(tx, bind(entry)), {
        many: (entries: ActorEntry[]) => recordMany(tx, entries.map(bind)),
      });
      return fn(tx, log);
    },
    { timeout: options?.timeoutMs ?? 15_000 },
  );
}

export interface AuditRow {
  action: string;
  userId: string | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: Date;
}

/** Read-only: the audit trail of one record, oldest first (status timelines, F19 viewer). */
async function history(entity: string, entityId: string): Promise<AuditRow[]> {
  return prisma().auditLog.findMany({
    where: { entity, entityId },
    orderBy: { createdAt: 'asc' },
    select: { action: true, userId: true, oldValue: true, newValue: true, createdAt: true },
  });
}

/** Read-only: the audit trails of several records of one entity, oldest first. */
async function historyOf(
  entity: string,
  entityIds: string[],
): Promise<Array<AuditRow & { entityId: string }>> {
  if (entityIds.length === 0) return [];
  return prisma().auditLog.findMany({
    where: { entity, entityId: { in: entityIds } },
    orderBy: { createdAt: 'asc' },
    select: {
      entityId: true,
      action: true,
      userId: true,
      oldValue: true,
      newValue: true,
      createdAt: true,
    },
  });
}

export const audit = { record, recordMany, history, historyOf };
