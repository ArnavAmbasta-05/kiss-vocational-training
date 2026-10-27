import request from 'supertest';
import { Role } from '@prisma/client';
import type { Express } from 'express';
import { createApp } from '../app';
import { signAccessToken } from '../core/auth';
import { disconnectPrisma, prisma } from '../core/db';
import { createLoginUser, createTrainedBatch } from '../../test/fixtures';
import { bearer } from '../../test/http';
import { fillPath, listRoutes, type RouteInfo } from '../../test/routes';

// This suite sends a few hundred requests from one address; lift the flood limiter only here.
process.env.GLOBAL_RATE_LIMIT_PER_15MIN = '100000';

let app: Express;
let routes: RouteInfo[];
const ROLES: Role[] = [Role.STUDENT, Role.TRAINER, Role.ADMIN];
const tokenFor = (u: { id: string; role: Role }) => bearer(signAccessToken(u).token);

beforeAll(() => {
  app = createApp();
  routes = listRoutes(app);
});
afterAll(() => disconnectPrisma());

const call = (r: RouteInfo, path: string, headers: Record<string, string> = {}) => {
  const req =
    request(app)[r.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](path);
  req.set(headers);
  return ['POST', 'PUT', 'PATCH'].includes(r.method) ? req.send({}) : req;
};
const label = (r: RouteInfo) => `${r.method} ${r.path}`;

/**
 * Routes that answer without a signed-in user. Anything new here must be a deliberate choice:
 * public pages (BR-15), sign-in, signed file links, health and cron jobs (own secret).
 */
const UNAUTHENTICATED = [
  'GET /health',
  'GET /api/v1/health',
  'GET /api/v1/public/verify/:code',
  'GET /api/v1/public/passport/:token',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'GET /api/v1/files/:token',
  'PUT /api/v1/files/:token',
  'GET /api/v1/internal/jobs/risk-evaluation',
  'POST /api/v1/internal/jobs/risk-evaluation',
  'GET /api/v1/internal/jobs/analytics-refresh',
  'POST /api/v1/internal/jobs/analytics-refresh',
];

describe('route inventory (TAD §9, CLAUDE.md rule 2)', () => {
  it('finds every route, and only the known public ones skip sign-in', () => {
    expect(routes.length).toBeGreaterThan(100);
    expect(
      routes
        .filter((r) => !r.authenticated)
        .map(label)
        .sort(),
    ).toEqual([...UNAUTHENTICATED].sort());
  });

  it('pins who may call each route; any change shows up here and in review', () => {
    // The access matrix. Update it with `pnpm test -u` only for an intended change.
    expect(
      routes
        .filter((r) => r.authenticated)
        .map((r) => `${label(r)}  →  ${r.roles?.join(', ') ?? 'any signed-in user'}`),
    ).toMatchSnapshot();
  });

  it('every signed-in route answers 401 without a token', async () => {
    const failures: string[] = [];
    for (const r of routes.filter((x) => x.authenticated)) {
      const res = await call(r, fillPath(r.path));
      if (res.status !== 401) failures.push(`${label(r)} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('internal job routes refuse calls without the cron secret', async () => {
    for (const r of routes.filter((x) => x.path.startsWith('/api/v1/internal/jobs'))) {
      expect((await call(r, r.path)).status).toBe(401);
      expect((await call(r, r.path, { Authorization: 'Bearer wrong-secret' })).status).toBe(401);
    }
  });
});

describe('role escalation (BRQ-1.2)', () => {
  it('every role-restricted route answers 403 to every other role, before validation', async () => {
    const users = Object.fromEntries(
      await Promise.all(
        ROLES.map(async (role) => [role, tokenFor(await createLoginUser(prisma(), role))] as const),
      ),
    ) as unknown as Record<Role, Record<string, string>>;
    const failures: string[] = [];
    let checked = 0;
    for (const r of routes.filter((x) => x.authenticated && x.roles)) {
      for (const role of ROLES.filter((x) => !r.roles!.includes(x))) {
        checked++;
        const res = await call(r, fillPath(r.path), users[role]);
        if (res.status !== 403) failures.push(`${role} ${label(r)} → ${res.status}`);
      }
    }
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(100);
  });
});

describe('cross-user access (BR-05, BRQ-1.3)', () => {
  /**
   * Two batches, A and B, each with a trainer, a student with attendance and marks, a session
   * and an assessment. Signed in as A's student or trainer, every route that takes one of B's
   * ids must refuse (403) or hide it (404) — never answer, never validate the body first.
   */
  it('student A and trainer A cannot reach batch B or student B through any :id route', async () => {
    const db = prisma();
    const [a, b] = await Promise.all([
      createTrainedBatch(db, [{ attended: 2, marks: 30, recommended: true }]),
      createTrainedBatch(db, [{ attended: 2, marks: 30, recommended: true }]),
    ]);
    const result = await db.assessmentResult.findFirstOrThrow({
      where: { assessmentId: b.assessment.id },
    });
    const values: Record<string, string> = {
      studentId: b.students[0]!.studentId,
      batchId: b.batch.id,
      sessionId: b.sessions[0]!.id,
      assessmentId: b.assessment.id,
      enrollmentId: b.students[0]!.enrollmentId,
      resultId: result.id,
    };
    const actors = [
      { name: 'student A', role: Role.STUDENT, headers: tokenFor(a.students[0]!.user) },
      { name: 'trainer A', role: Role.TRAINER, headers: tokenFor(a.trainer) },
    ];
    const params = (path: string) => [...path.matchAll(/:(\w+)/g)].map((m) => m[1]!);

    const failures: string[] = [];
    let checked = 0;
    for (const r of routes.filter((x) => x.authenticated)) {
      const names = params(r.path);
      if (names.length === 0 || !names.some((n) => n in values)) continue;
      for (const actor of actors) {
        if (r.roles && !r.roles.includes(actor.role)) continue;
        checked++;
        const res = await call(r, fillPath(r.path, values), actor.headers);
        if (![403, 404].includes(res.status)) {
          failures.push(`${actor.name} ${label(r)} → ${res.status}`);
        }
      }
    }
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(20);
  });
});

describe('stored text is data, never markup', () => {
  it('returns script-like input exactly as typed, as JSON (the web app renders it as text)', async () => {
    const admin = await createLoginUser(prisma(), Role.ADMIN);
    const payload = `<img src=x onerror=alert(1)><script>alert('x')</script>`;
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set(tokenFor(admin))
      .send({ fullName: `Admin ${payload}` });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    const me = await request(app).get('/api/v1/auth/me').set(tokenFor(admin)).expect(200);
    expect(me.body.user?.fullName ?? me.body.fullName).toBe(`Admin ${payload}`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
