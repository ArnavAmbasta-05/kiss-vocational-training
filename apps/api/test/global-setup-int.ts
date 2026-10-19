import { execSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

/** Brings the integration-test database up to the latest migration before any test runs. */
export default function globalSetup() {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://vtmp:vtmp@localhost:5432/vtmp_test?schema=public';
  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
