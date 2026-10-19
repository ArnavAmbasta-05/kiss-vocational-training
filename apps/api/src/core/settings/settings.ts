import type { Prisma } from '@prisma/client';
import { withAudit, type Actor } from '../audit';
import { prisma, type Tx } from '../db';
import { logger } from '../logger';
import {
  SETTINGS,
  SETTING_KEYS,
  isSettingKey,
  parseSetting,
  type SettingKey,
  type SettingValue,
  type SettingsMap,
} from './registry';

const CACHE_TTL_MS = 60_000;

let cache: { values: SettingsMap; loadedAt: number } | undefined;

/**
 * Loads every setting once, falling back to the registry default for a missing or invalid row
 * (an invalid row is logged, never trusted).
 */
async function loadAll(): Promise<SettingsMap> {
  const rows = await prisma().setting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const values = {} as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) {
    const def = SETTINGS[key];
    const raw = byKey.get(key);
    if (raw === undefined) {
      values[key] = def.default;
      continue;
    }
    const parsed = def.schema.safeParse(raw);
    if (parsed.success) {
      values[key] = parsed.data;
    } else {
      logger.warn({ key }, 'invalid stored setting; using default');
      values[key] = def.default;
    }
  }
  return values as SettingsMap;
}

async function all(): Promise<SettingsMap> {
  if (!cache || Date.now() - cache.loadedAt > CACHE_TTL_MS) {
    cache = { values: await loadAll(), loadedAt: Date.now() };
  }
  return cache.values;
}

/** Typed read of one threshold, e.g. `await settings.get('attendance.minPercent')` → 75. */
async function get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  return (await all())[key];
}

/** Several thresholds in one call, for rule functions that need a bundle. */
async function getMany<K extends SettingKey>(keys: readonly K[]): Promise<Pick<SettingsMap, K>> {
  const values = await all();
  return Object.fromEntries(keys.map((k) => [k, values[k]])) as Pick<SettingsMap, K>;
}

/**
 * Validates and stores a value with its audit row in one transaction, then drops the cache
 * (after commit, so no reader can re-cache the old value mid-write).
 */
async function set<K extends SettingKey>(
  actor: Actor,
  key: K,
  value: unknown,
): Promise<SettingValue<K>> {
  const parsed = parseSetting(key, value);
  const json = parsed as Prisma.InputJsonValue;
  await withAudit(actor, async (tx, log) => {
    const existing = await tx.setting.findUnique({ where: { key } });
    await tx.setting.upsert({
      where: { key },
      create: { key, value: json, updatedById: actor.userId },
      update: { value: json, updatedById: actor.userId },
    });
    await log({
      action: 'SETTING_UPDATED',
      entity: 'Setting',
      entityId: key,
      oldValue: existing?.value ?? SETTINGS[key].default,
      newValue: parsed,
    });
  });
  invalidate();
  return parsed;
}

/** Inserts defaults for keys with no row yet; never overwrites an admin's change. */
async function seedDefaults(client: Tx = prisma()): Promise<number> {
  const result = await client.setting.createMany({
    data: SETTING_KEYS.map((key) => ({
      key,
      value: SETTINGS[key].default as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });
  invalidate();
  return result.count;
}

function invalidate(): void {
  cache = undefined;
}

export const settings = { get, getMany, all, set, seedDefaults, invalidate, isSettingKey };
