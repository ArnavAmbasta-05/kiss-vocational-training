import bcrypt from 'bcrypt';
import type { PrismaClient } from '@prisma/client';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@vtmp/shared';
import { audit } from '../core/audit';
import { EMAIL_DOMAIN } from './data';

const BCRYPT_COST = 12;

/**
 * Sets one new password on every seeded account (emails @kiss-vtmp.test: admin, trainers,
 * students), clears login locks and signs those accounts out everywhere. Each change is
 * audit-logged in the same transaction. Accounts with real emails are never touched.
 */
export async function resetSeedPasswords(
  prisma: PrismaClient,
  password: string,
  log: (message: string) => void = () => undefined,
): Promise<number> {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(
      `The new password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`,
    );
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const where = { email: { endsWith: `@${EMAIL_DOMAIN}` } };

  const count = await prisma.$transaction(
    async (tx) => {
      const users = await tx.user.findMany({ where, select: { id: true } });
      const ids = users.map((u) => u.id);
      await tx.user.updateMany({
        where: { id: { in: ids } },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });
      await tx.refreshToken.updateMany({
        where: { userId: { in: ids }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // System action (no acting user). Never log password material.
      for (const id of ids) {
        await audit.record(tx, {
          userId: null,
          action: 'USER_PASSWORD_RESET',
          entity: 'User',
          entityId: id,
          newValue: { by: 'seed --reset-passwords' },
        });
      }
      return ids.length;
    },
    { timeout: 60_000 },
  );
  log(`passwords reset: ${count} seeded accounts (signed out everywhere)`);
  return count;
}
