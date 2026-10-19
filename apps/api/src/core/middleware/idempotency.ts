import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { RequestHandler, Response } from 'express';
import { prisma } from '../db';
import { AppError } from '../errors';

const KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
/** A claimed key whose request never finished (crash, timeout) is released after this. */
const IN_PROGRESS_STALE_MS = 60_000;
/** Stored responses are replayed for this long; afterwards the key may be reused. */
const RETENTION_MS = 24 * 60 * 60 * 1000;
const PENDING = 0;

function requestHash(route: string, body: unknown): string {
  return createHash('sha256')
    .update(`${route}\n${JSON.stringify(body ?? null)}`)
    .digest('hex');
}

/**
 * Idempotency-Key support (TAD §7) for retry-safe actions: approve, bulk review, allocation
 * confirm, certificate issue. Must run after authenticate (keys are scoped per user) and after
 * validation (the hash covers the parsed body).
 *
 * - First request with a key claims it, runs, and its 2xx response is stored before it is sent
 *   (serverless functions may freeze right after responding).
 * - A retry with the same key and body gets the stored response, marked Idempotent-Replayed.
 * - The same key with a different body or route → 422 IDEMPOTENCY_KEY_REUSED.
 * - The same key while the first request still runs → 409 IDEMPOTENCY_IN_PROGRESS.
 * - Errors are not stored: the key is released so the client can retry.
 * Requests without the header behave normally.
 */
export function idempotency(): RequestHandler {
  return (req, res, next) => {
    const key = req.get('Idempotency-Key');
    if (key === undefined) return next();
    if (!req.user) return next(AppError.unauthorized());
    if (!KEY_PATTERN.test(key)) {
      return next(
        AppError.badRequest(
          'INVALID_IDEMPOTENCY_KEY',
          'Idempotency-Key must be 1–128 letters, digits or . _ : -',
        ),
      );
    }

    const userId = req.user.id;
    const route = `${req.method} ${req.originalUrl.split('?')[0]}`;
    const hash = requestHash(route, req.body);

    claim(userId, key, route, hash)
      .then((outcome) => {
        if (outcome.kind === 'replay') {
          res.status(outcome.status).set('Idempotent-Replayed', 'true').json(outcome.body);
          return;
        }
        captureResponse(res, outcome.id);
        next();
      })
      .catch(next);
  };
}

type Claim = { kind: 'claimed'; id: string } | { kind: 'replay'; status: number; body: unknown };

async function claim(userId: string, key: string, route: string, hash: string): Promise<Claim> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const row = await prisma().idempotencyKey.create({
        data: { key, userId, route, requestHash: hash, responseStatus: PENDING, responseBody: {} },
      });
      return { kind: 'claimed', id: row.id };
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }

    const existing = await prisma().idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (!existing) continue; // released between our insert and read: try again
    const age = Date.now() - existing.createdAt.getTime();
    const stale =
      age > RETENTION_MS || (existing.responseStatus === PENDING && age > IN_PROGRESS_STALE_MS);
    if (stale) {
      await prisma().idempotencyKey.deleteMany({ where: { id: existing.id } });
      continue;
    }
    if (existing.route !== route || existing.requestHash !== hash) {
      throw AppError.unprocessable(
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used for a different request',
      );
    }
    if (existing.responseStatus === PENDING) {
      throw AppError.conflict(
        'IDEMPOTENCY_IN_PROGRESS',
        'A request with this Idempotency-Key is still being processed',
      );
    }
    return { kind: 'replay', status: existing.responseStatus, body: existing.responseBody };
  }
  throw AppError.conflict('IDEMPOTENCY_IN_PROGRESS', 'Please retry the request');
}

/** Stores a 2xx response (or releases the key on error) before the response is sent. */
function captureResponse(res: Response, id: string): void {
  const send = res.json.bind(res);
  res.json = (body: unknown) => {
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    const persist = ok
      ? prisma().idempotencyKey.update({
          where: { id },
          data: {
            responseStatus: res.statusCode,
            responseBody: (body ?? {}) as Prisma.InputJsonValue,
          },
        })
      : prisma().idempotencyKey.deleteMany({ where: { id } });
    persist.then(
      () => send(body),
      () => send(body),
    );
    return res;
  };
}
