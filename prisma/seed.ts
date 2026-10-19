import { PrismaClient } from '@prisma/client';
import { runSeed } from '../apps/api/src/seed';
import { resetSeedPasswords } from '../apps/api/src/seed/resetPasswords';

/**
 * Usage:
 *   pnpm db:seed                      60 students (idempotent; never changes existing accounts)
 *   pnpm db:seed --large              500 students (BO-3 timing test)
 *   pnpm db:seed --reset-passwords    set SEED_PASSWORD on every seeded account (admin included)
 */
async function main() {
  const prisma = new PrismaClient();
  const started = Date.now();
  const log = (m: string) => console.log(`  ${m}`);
  try {
    if (process.argv.includes('--reset-passwords')) {
      const password = process.env.SEED_PASSWORD;
      // Refuse the documented default: resetting a public demo to it would undo the point.
      if (!password || password === 'Password@123') {
        throw new Error('Set SEED_PASSWORD to the new demo password (not the default).');
      }
      await resetSeedPasswords(prisma, password, log);
    } else {
      await runSeed(prisma, { large: process.argv.includes('--large'), log });
    }
    console.log(`Seed complete in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
