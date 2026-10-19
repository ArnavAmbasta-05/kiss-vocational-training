import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v));

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  PUBLIC_BASE_URL: z.string().url(),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  STORAGE_BUCKET: optionalString,
  STORAGE_ENDPOINT: optionalString,
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_ACCESS_KEY_ID: optionalString,
  STORAGE_SECRET_ACCESS_KEY: optionalString,
  AI_ENABLED: booleanString,
  ANTHROPIC_API_KEY: optionalString,
  AI_MONTHLY_CAP: z.coerce.number().nonnegative().default(0),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  const problems = parsed.success
    ? []
    : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);

  if (parsed.success) {
    const env = parsed.data;
    if (env.STORAGE_DRIVER === 's3' && !env.STORAGE_BUCKET) {
      problems.push('STORAGE_BUCKET: required when STORAGE_DRIVER=s3');
    }
    if (env.AI_ENABLED && !env.ANTHROPIC_API_KEY) {
      problems.push('ANTHROPIC_API_KEY: required when AI_ENABLED=true');
    }
    if (problems.length === 0) return env;
  }
  // Report variable names and reasons only, never values (they may be secrets).
  throw new Error(
    `Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
  );
}

let cached: Env | undefined;

/** Validated configuration, loaded once on first access. */
export function config(): Env {
  cached ??= loadEnv();
  return cached;
}
