import { PrismaClient, type Prisma } from '@prisma/client';
import { config } from '../config';

/** Free-tier databases allow few connections (TAD §15.1), so the pool is kept at 5. */
export const DEFAULT_CONNECTION_LIMIT = 5;

export function withConnectionLimit(url: string, limit = DEFAULT_CONNECTION_LIMIT): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', String(limit));
  }
  return parsed.toString();
}

let client: PrismaClient | undefined;

export function prisma(): PrismaClient {
  client ??= new PrismaClient({
    datasources: { db: { url: withConnectionLimit(config().DATABASE_URL) } },
  });
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

/** Transaction client, for services that must run inside prisma.$transaction. */
export type Tx = Prisma.TransactionClient;
