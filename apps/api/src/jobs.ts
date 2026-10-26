import cron from 'node-cron';
import { logger } from './core/logger';
import { refresh } from './modules/analytics/analytics.service';
import { evaluateAll } from './modules/intervention/intervention.service';

/**
 * Local scheduled jobs (long-running server only). Production has no always-on process, so
 * Vercel Cron calls /api/v1/internal/jobs/* instead (vercel.json). Both take the same job
 * lease, so a local run and a manual run never overlap.
 */
export function startLocalJobs(): void {
  // BRQ-11.1: daily risk evaluation at 02:00 India time.
  cron.schedule(
    '0 2 * * *',
    () => {
      evaluateAll()
        .then((summary) => logger.info({ summary }, 'risk evaluation finished'))
        .catch((err: unknown) => logger.error({ err }, 'risk evaluation failed'));
    },
    { timezone: 'Asia/Kolkata' },
  );
  // F20: refresh the outcome analytics views at 02:30 India time, after the risk run.
  cron.schedule(
    '30 2 * * *',
    () => {
      refresh()
        .then((r) => logger.info(r, 'analytics refresh finished'))
        .catch((err: unknown) => logger.error({ err }, 'analytics refresh failed'));
    },
    { timezone: 'Asia/Kolkata' },
  );
}
