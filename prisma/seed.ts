import { PrismaClient } from '@prisma/client';
import { runSeed } from '../apps/api/src/seed';

/** Usage: `pnpm db:seed` (60 students) or `pnpm db:seed --large` (500 students). */
async function main() {
  const prisma = new PrismaClient();
  const large = process.argv.includes('--large');
  const started = Date.now();
  try {
    await runSeed(prisma, { large, log: (m) => console.log(`  ${m}`) });
    console.log(`Seed complete in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
