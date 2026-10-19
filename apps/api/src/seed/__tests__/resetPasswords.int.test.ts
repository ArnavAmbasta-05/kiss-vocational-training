import { Role } from '@prisma/client';
import { createApp } from '../../app';
import { hashPassword } from '../../core/auth';
import { disconnectPrisma, prisma } from '../../core/db';
import { createLoginUser, uid } from '../../../test/fixtures';
import { login } from '../../../test/http';
import { resetSeedPasswords } from '../resetPasswords';

afterAll(() => disconnectPrisma());

describe('seed --reset-passwords', () => {
  it('resets seeded accounts only, unlocks them, signs them out and audits it', async () => {
    const app = createApp();
    const seeded = await prisma().user.create({
      data: {
        email: `seed-${uid()}@kiss-vtmp.test`,
        fullName: 'Seeded Trainer',
        role: Role.TRAINER,
        passwordHash: await hashPassword('Old-Demo-Pass-1'),
        failedLoginCount: 3,
        lockedUntil: new Date(Date.now() + 60_000),
      },
    });
    const real = await createLoginUser(prisma(), Role.STUDENT); // @test.local, not seeded
    const realBefore = await prisma().user.findUniqueOrThrow({ where: { id: real.id } });
    await prisma().refreshToken.create({
      data: {
        userId: seeded.id,
        tokenHash: `test-${uid()}`,
        familyId: '00000000-0000-4000-8000-000000000001',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const count = await resetSeedPasswords(prisma(), 'Fresh-Demo-Pass-2');
    expect(count).toBeGreaterThanOrEqual(1);

    expect((await login(app, seeded.email, 'Old-Demo-Pass-1')).res.status).toBe(401);
    expect((await login(app, seeded.email, 'Fresh-Demo-Pass-2')).res.status).toBe(200);
    const realAfter = await prisma().user.findUniqueOrThrow({ where: { id: real.id } });
    expect(realAfter.passwordHash).toBe(realBefore.passwordHash);

    expect(
      await prisma().refreshToken.count({
        where: { userId: seeded.id, tokenHash: { startsWith: 'test-' }, revokedAt: null },
      }),
    ).toBe(0);
    const entry = await prisma().auditLog.findFirstOrThrow({
      where: { action: 'USER_PASSWORD_RESET', entityId: seeded.id },
    });
    expect(JSON.stringify(entry)).not.toContain('Fresh-Demo-Pass-2');
    // Response status already proves the unlock; double-check the columns.
    const row = await prisma().user.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(row.lockedUntil).toBeNull();
  });

  it('rejects passwords shorter than 8 characters', async () => {
    await expect(resetSeedPasswords(prisma(), 'short')).rejects.toThrow(/8/);
  });
});
