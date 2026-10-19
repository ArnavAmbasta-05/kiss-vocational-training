import { settings } from '..';
import { disconnectPrisma, prisma } from '../../db';
import { createAdmin } from '../../../../test/fixtures';

// Tests change real Setting rows; restore defaults so other suites see the registry values.
async function resetSetting(key: string) {
  await prisma().setting.deleteMany({ where: { key } });
  settings.invalidate();
}

afterAll(async () => {
  await resetSetting('attendance.minPercent');
  await resetSetting('grade.bands');
  await disconnectPrisma();
});

describe('settings', () => {
  beforeEach(() => resetSetting('attendance.minPercent'));

  it('returns the registry default when no row exists', async () => {
    expect(await settings.get('attendance.minPercent')).toBe(75);
  });

  it('set() stores the value, audits old → new and refreshes the cache', async () => {
    const admin = await createAdmin(prisma());
    expect(await settings.get('attendance.minPercent')).toBe(75); // warm the cache

    await settings.set({ userId: admin.id }, 'attendance.minPercent', 80);

    expect(await settings.get('attendance.minPercent')).toBe(80);
    const log = await prisma().auditLog.findFirstOrThrow({
      where: { entity: 'Setting', entityId: 'attendance.minPercent', userId: admin.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toMatchObject({ action: 'SETTING_UPDATED', oldValue: 75, newValue: 80 });
  });

  it('rejects invalid values and writes nothing', async () => {
    const admin = await createAdmin(prisma());
    await expect(
      settings.set({ userId: admin.id }, 'attendance.minPercent', 140),
    ).rejects.toThrow();
    await expect(
      settings.set({ userId: admin.id }, 'grade.bands', { A: 70, B: 85, C: 55, D: 40 }),
    ).rejects.toThrow(/descending/);
    expect(
      await prisma().setting.findUnique({ where: { key: 'attendance.minPercent' } }),
    ).toBeNull();
  });

  it('falls back to the default when a stored row is invalid', async () => {
    await prisma().setting.create({ data: { key: 'attendance.minPercent', value: 'seventy' } });
    settings.invalidate();
    expect(await settings.get('attendance.minPercent')).toBe(75);
  });

  it('getMany() returns a typed bundle', async () => {
    const bundle = await settings.getMany(['aggregate.minPercent', 'grade.bands'] as const);
    expect(bundle).toEqual({
      'aggregate.minPercent': 40,
      'grade.bands': { A: 85, B: 70, C: 55, D: 40 },
    });
  });
});
