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

export type AuditFn = (entry: Omit<AuditEntry, 'userId' | 'ip'>) => Promise<void>;

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
    (tx) => fn(tx, (entry) => record(tx, { ...entry, userId: actor.userId, ip: actor.ip })),
    { timeout: options?.timeoutMs ?? 15_000 },
  );
}

export const audit = { record };
