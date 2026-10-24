import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';

/**
 * Runs `fn` only if no other run of the same job holds the lease, so two runs never overlap
 * (TAD §8.2). Production talks to Neon through PgBouncer in transaction mode, where a session
 * advisory lock is released as soon as the connection goes back to the pool, so the lease is a
 * row claimed with one atomic upsert instead. A crashed run's lease expires after `ttlMs`.
 *
 * Returns `{ ran: false }` when another run holds the lease.
 */
export async function withJobLease<T>(
  name: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> {
  const runId = randomUUID();
  const until = new Date(Date.now() + ttlMs);
  const claimed = await prisma().$queryRaw<Array<{ run_id: string }>>`
    INSERT INTO job_locks (name, run_id, locked_until)
    VALUES (${name}, ${runId}::uuid, ${until})
    ON CONFLICT (name) DO UPDATE
      SET run_id = EXCLUDED.run_id, locked_until = EXCLUDED.locked_until
      WHERE job_locks.locked_until < now()
    RETURNING run_id`;
  if (claimed.length === 0) return { ran: false };

  let result: T | undefined;
  let error: unknown;
  try {
    result = await fn();
  } catch (err) {
    error = err;
  }
  const outcome = (
    error === undefined
      ? { ok: true, result }
      : { ok: false, error: error instanceof Error ? error.message : String(error) }
  ) as unknown;
  // Release only our own lease; record the outcome for operators.
  await prisma().jobLock.updateMany({
    where: { name, runId },
    data: {
      lockedUntil: new Date(),
      lastRunAt: new Date(),
      lastResult: JSON.parse(JSON.stringify(outcome)) as Prisma.InputJsonValue,
    },
  });
  if (error !== undefined) throw error;
  return { ran: true, result: result as T };
}
