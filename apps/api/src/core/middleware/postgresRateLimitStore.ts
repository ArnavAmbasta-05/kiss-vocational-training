import { createHash } from 'node:crypto';
import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';
import { prisma } from '../db';

/** Roughly one increment in this many also prunes expired rows. */
const PRUNE_EVERY = 100;

/**
 * Fixed-window counters in the rate_limits table, so every serverless instance shares one count
 * (the default memory store is per instance). Keys are hashed: no raw IPs are stored.
 */
export class PostgresRateLimitStore implements Store {
  windowMs = 60_000;
  /** Counts live in the database, not this process. */
  localKeys = false;

  constructor(public readonly prefix: string) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private key(key: string): string {
    return `${this.prefix}:${createHash('sha256').update(key).digest('hex')}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const seconds = this.windowMs / 1000;
    // One atomic upsert: start a new window if the old one expired, otherwise add a hit.
    const rows = await prisma().$queryRaw<{ hits: number; reset_at: Date }[]>`
      INSERT INTO rate_limits (key, hits, reset_at)
      VALUES (${this.key(key)}, 1, now() + make_interval(secs => ${seconds}::double precision))
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.hits + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at <= now()
          THEN now() + make_interval(secs => ${seconds}::double precision)
          ELSE rate_limits.reset_at END
      RETURNING hits, reset_at`;
    if (Math.random() < 1 / PRUNE_EVERY) void this.prune();
    const row = rows[0]!;
    return { totalHits: Number(row.hits), resetTime: row.reset_at };
  }

  async decrement(key: string): Promise<void> {
    await prisma().$executeRaw`
      UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE key = ${this.key(key)}`;
  }

  async resetKey(key: string): Promise<void> {
    await prisma().$executeRaw`DELETE FROM rate_limits WHERE key = ${this.key(key)}`;
  }

  private async prune(): Promise<void> {
    try {
      await prisma()
        .$executeRaw`DELETE FROM rate_limits WHERE reset_at < now() - interval '1 hour'`;
    } catch {
      // Pruning is housekeeping; a failure must never affect the request.
    }
  }
}
