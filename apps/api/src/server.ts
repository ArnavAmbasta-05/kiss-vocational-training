import { createApp } from './app';
import { config } from './core/config';
import { disconnectPrisma } from './core/db';
import { startLocalJobs } from './jobs';
import { logger } from './core/logger';

function main() {
  const env = config();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'VTMP API listening');
  });
  if (env.NODE_ENV !== 'test') startLocalJobs();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      void disconnectPrisma().finally(() => process.exit(0));
    });
    // Force exit if connections don't drain in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

try {
  main();
} catch (err) {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
}
