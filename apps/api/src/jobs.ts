import cron from 'node-cron';
import { logger } from './core/logger';
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
}
