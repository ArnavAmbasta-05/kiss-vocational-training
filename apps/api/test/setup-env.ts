import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';

// Load the developer's .env (if any), then force test-safe values.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.BCRYPT_ROUNDS = '4';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL ??= 'postgresql://vtmp:vtmp@localhost:5432/vtmp_test?schema=public';
process.env.JWT_SECRET ??= 'test-access-secret-that-is-at-least-32-chars';
process.env.REFRESH_SECRET ??= 'test-refresh-secret-that-is-at-least-32-chars';
process.env.PUBLIC_BASE_URL ??= 'http://localhost:5173';
process.env.CORS_ORIGINS ??= 'http://localhost:5173';
// Certificate PDFs from integration tests go to a temp folder, never the developer's ./storage.
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), 'vtmp-test-storage');
