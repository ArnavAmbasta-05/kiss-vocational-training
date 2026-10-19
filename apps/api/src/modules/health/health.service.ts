import type { HealthResponse } from '@vtmp/shared';
import { prisma } from '../../core/db';

const DB_CHECK_TIMEOUT_MS = 2000;

export async function isDatabaseReachable(): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('db check timed out')), DB_CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([prisma().$queryRaw`SELECT 1`, timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function getHealth(): Promise<HealthResponse> {
  const dbOk = await isDatabaseReachable();
  return {
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'ok' : 'error',
    version: process.env.npm_package_version ?? '0.1.0',
    time: new Date().toISOString(),
  };
}
