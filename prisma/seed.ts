import { PrismaClient } from '@prisma/client';

/**
 * Idempotent seed. Sprint 0 only verifies the connection; Sprint 1 adds the admin,
 * trainers, students, courses, cycle and every Setting.
 */
async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.count();
    console.log(`Seed: database reachable (${users} users). Nothing to seed yet.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
