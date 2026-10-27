import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../logger';

/** What the previous run of a job left behind, for catching up (TAD §8.2). */
export interface PreviousRun {
  /** When the job last finished without an error; null if never. */
  lastSuccessAt: Date | null;
  /** The previous run's own result (or error), as stored. */
  lastResult: unknown;
}

/**
 * Scheduled runs missed since the last success: a daily job last successful 3 days ago has
 * missed 2. Rounded, so a cron that fires a little early or late (Vercel Hobby runs within the
 * hour) is not counted as missed.
 */
export function missedRuns(lastSuccessAt: Date | null, now: Date, everyMs: number): number {
  if (!lastSuccessAt) return 0;
  return Math.max(0, Math.round((now.getTime() - lastSuccessAt.getTime()) / everyMs) - 1);
}

/**
 * Runs `fn` only if no other run of the same job holds the lease, so two runs never overlap
 * (TAD §8.2). Production talks to Neon through PgBouncer in transaction mode, where a session
 * advisory lock is released as soon as the connection goes back to the pool, so the lease is a
 * row claimed with one atomic upsert instead. A crashed run's lease expires after `ttlMs`.
 *
 * `fn` receives the previous run's outcome so it can catch up (finish work a run left over).
 * With `everyMs`, missed scheduled runs are logged. Returns `{ ran: false }` when another run
 * holds the lease.
 */
export async function withJobLease<T>(
  name: string,
  ttlMs: number,
  fn: (previous: PreviousRun) => Promise<T>,
  options: { everyMs?: number } = {},
): Promise<{ ran: true; result: T; missedRuns: number } | { ran: false }> {
  const runId = randomUUID();
  const until = new Date(Date.now() + ttlMs);
  const claimed = await prisma().$queryRaw<
    Array<{ run_id: string; last_success_at: Date | null; last_result: unknown }>
  >`
    INSERT INTO job_locks (name, run_id, locked_until)
    VALUES (${name}, ${runId}::uuid, ${until})
    ON CONFLICT (name) DO UPDATE
      SET run_id = EXCLUDED.run_id, locked_until = EXCLUDED.locked_until
      WHERE job_locks.locked_until < now()
    RETURNING run_id, last_success_at, last_result`;
  if (claimed.length === 0) return { ran: false };
  const previous: PreviousRun = {
    lastSuccessAt: claimed[0]!.last_success_at,
    lastResult: claimed[0]!.last_result,
  };
  const missed = options.everyMs
    ? missedRuns(previous.lastSuccessAt, new Date(), options.everyMs)
    : 0;
  if (missed > 0) {
    logger.warn({ job: name, missed, lastSuccessAt: previous.lastSuccessAt }, 'job missed runs');
  }

  let result: T | undefined;
  let error: unknown;
  try {
    result = await fn(previous);
  } catch (err) {
    error = err;
  }
  const outcome = (
    error === undefined
      ? { ok: true, result }
      : { ok: false, error: error instanceof Error ? error.message : String(error) }
  ) as unknown;
  // Release only our own lease; record the outcome for operators and the next run.
  const now = new Date();
  await prisma().jobLock.updateMany({
    where: { name, runId },
    data: {
      lockedUntil: now,
      lastRunAt: now,
      ...(error === undefined ? { lastSuccessAt: now } : {}),
      lastResult: JSON.parse(JSON.stringify(outcome)) as Prisma.InputJsonValue,
    },
  });
  if (error !== undefined) throw error;
  return { ran: true, result: result as T, missedRuns: missed };
}
