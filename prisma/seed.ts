import { PrismaClient } from '@prisma/client';
import { runSeed } from '../apps/api/src/seed';
import { removeOldSeedStudents } from '../apps/api/src/seed/removeOldStudents';
import { resetSeedPasswords } from '../apps/api/src/seed/resetPasswords';

/**
 * Usage:
 *   pnpm db:seed                      40 students (idempotent; renames seeded students 001–040)
 *   pnpm db:seed --large              500 students (BO-3 timing test)
 *   pnpm db:seed --reset-passwords    set SEED_PASSWORD on every seeded account (admin included)
 *   pnpm db:seed --remove-old-students  remove seeded students 041–060 left by the old 60-student
 *                                     seed (deleted, or deactivated if they have records)
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
    } else if (process.argv.includes('--remove-old-students')) {
      await removeOldSeedStudents(prisma, log);
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
