import { audit, withAudit } from '..';
import { disconnectPrisma, prisma } from '../../db';
import { uid } from '../../../../test/fixtures';

afterAll(() => disconnectPrisma());

describe('withAudit', () => {
  it('commits the change and its audit row together (BRQ-19.1)', async () => {
    const key = `test.audit.${uid()}`;
    await withAudit({ userId: null, ip: '127.0.0.1' }, async (tx, log) => {
      await tx.setting.create({ data: { key, value: 1 } });
      await log({ action: 'SETTING_CREATED', entity: 'Setting', entityId: key, newValue: 1 });
    });

    expect(await prisma().setting.findUnique({ where: { key } })).not.toBeNull();
    const rows = await prisma().auditLog.findMany({ where: { entity: 'Setting', entityId: key } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'SETTING_CREATED', newValue: 1, ip: '127.0.0.1' });
  });

  it('rolls back both when anything fails (NFR-05)', async () => {
    const key = `test.audit.${uid()}`;
    await expect(
      withAudit({ userId: null }, async (tx, log) => {
        await tx.setting.create({ data: { key, value: 1 } });
        await log({ action: 'SETTING_CREATED', entity: 'Setting', entityId: key, newValue: 1 });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await prisma().setting.findUnique({ where: { key } })).toBeNull();
    expect(await prisma().auditLog.count({ where: { entityId: key } })).toBe(0);
  });

  it('stores Dates and Decimals as plain JSON snapshots', async () => {
    const entityId = uid();
    await withAudit({ userId: null }, (_tx, log) =>
      log({
        action: 'TEST_EVENT',
        entity: 'Test',
        entityId,
        oldValue: { at: new Date('2026-01-02T03:04:05.000Z') },
        newValue: { big: BigInt(5) },
      }),
    );
    const row = await prisma().auditLog.findFirstOrThrow({ where: { entityId } });
    expect(row.oldValue).toEqual({ at: '2026-01-02T03:04:05.000Z' });
    expect(row.newValue).toEqual({ big: '5' });
  });
});

describe('audit.record', () => {
  it('refuses the root client, so audit rows cannot escape the transaction', async () => {
    await expect(
      audit.record(prisma(), { userId: null, action: 'X', entity: 'Test', entityId: uid() }),
    ).rejects.toThrow(/transaction client/);
  });
});
