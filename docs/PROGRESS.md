# KISS VTMP — Sprint Progress Log

Read this at the start of every session and update it at the end of every sprint.

## Template

```
## Sprint N — <name> (<status>, <date>)
### Built
### Deviations from BRD/TAD (and why)
### Known gaps / follow-ups
### Definition of done
- [ ] lint · [ ] typecheck · [ ] tests · [ ] openapi.yaml · [ ] seed · [ ] strings externalized
```

---

## Sprint 1 — Full schema, seed, settings and audit kernel (done, 2026-10-19)

### Built
- **Schema** (`prisma/schema.prisma`, migration `*_r1_r2_schema`): all R1 core tables (TAD §6.1)
  and R2 tables (§6.2) — 31 tables, UUID keys, snake_case, every FK indexed. Additions beyond the
  prompt list: `users.full_name`, `last_login_at`; `refresh_tokens.family_id` + `replaced_by_id`
  for rotation/reuse detection; `training_sessions.trainer_id` (for F14 clash checks);
  `attendance.first_marked_at` (anchors the 48 h window); `risk_flags.clear_since` (BR-17);
  `passport_shares.view_count`. No R3 tables.
- **Database-enforced rules** (raw SQL in the migration): BR-01 partial unique index; BR-07
  marks trigger (plus a guard against lowering `max_marks` below existing results); insert-only
  `audit_logs` (UPDATE/DELETE/TRUNCATE rejected); one open risk flag per student+batch; one VALID
  certificate per enrollment; ≥12-char certificate codes; range CHECKs (rank 1–3, levels 1–4,
  CGPA 0–10, positive capacity/weightage/max marks, ordered dates, `due_on ≥ created`);
  composite FK keeping `batch_students.student_id` consistent with its enrollment.
  Summary with mermaid diagrams in `docs/ER.md`.
- **`core/settings`**: typed registry of 18 thresholds (Zod schema + default + description),
  `settings.get/getMany/all` with a 60 s cache, `settings.set(actor, key, value)` that validates,
  writes and audits in one transaction then clears the cache, `seedDefaults()` that never
  overwrites admin changes. Invalid stored rows fall back to the default with a warning.
  Added `attendance.lateCountsAsPresent` (default true) now, ahead of Sprint 5.
- **`core/audit`**: `audit.record(tx, entry)` refuses the root client so audit rows always share
  the change's transaction; `withAudit(actor, (tx, log) => …)` wraps `prisma.$transaction` with
  a logger bound to the user and IP. Dates/Decimals/BigInts are stored as plain JSON.
- **Seed** (`pnpm db:seed`, idempotent): settings, 1 admin, 4 trainers, 60 students (CGPA
  5.00–9.79, deterministic), one cycle, 3 courses with open windows; `--large` → 500 students.
  Seed logic lives in `apps/api/src/seed` (so it resolves the API's dependencies);
  `prisma/seed.ts` is the entry point.
- **Tests**: 31 new — migrations create every R1/R2 table and no R3 table; audit trigger rejects
  UPDATE/DELETE/TRUNCATE; BR-01 rejects a second active enrollment and allows one after
  rejection; marks > max, negative marks, zero weightage, lowering max rejected; rank and level
  ranges; partial uniques for risk flags and certificates; composite FK; withAudit commit and
  rollback; settings get/set/audit/cache/invalid values; registry defaults.
  Integration tests migrate `vtmp_test` automatically (Jest global setup) and run in band.

### Deviations
- `IdempotencyKey` stores `request_hash`, `response_status` and `response_body` (instead of
  only a response hash) because Sprint 3 must replay the exact response.
- Grade bands are one Setting (`grade.bands`) validated as strictly descending, instead of four.
- Audit writes are explicit `audit.record` calls inside the transaction, not Prisma middleware
  (deprecated `$use`), as the sprint prompt allows.
- `Progress.student_id` is optional so a milestone can apply to a whole batch.

### Known gaps / follow-ups
- The app's DB role still owns `audit_logs`; TAD §6.3 also wants UPDATE/DELETE revoked from it.
  The triggers already block both; a separate least-privilege role belongs with deployment
  (Sprint 2).
- Seed passwords are dev-only and documented in the README.

### Definition of done
- [x] `pnpm db:migrate && pnpm db:seed` on a fresh DB (seed re-run is a no-op; `--large` works)
- [x] lint · format · typecheck · 49 API tests (21 unit + 28 integration) pass
- [x] docs/ER.md · README seed accounts · no new endpoints (openapi unchanged)

---

## Sprint 0 — Monorepo foundation (done, 2026-10-19)

### Built
- **Monorepo** (pnpm workspaces): `apps/api`, `apps/web`, `packages/shared`, `prisma/`.
  Strict TypeScript everywhere from `tsconfig.base.json`; `@vtmp/shared` consumed as TS source.
- **API kernel** (`apps/api/src/core`):
  - `config` — Zod-validated env loader (DATABASE_URL, JWT_SECRET, REFRESH_SECRET,
    PUBLIC_BASE_URL, CORS_ORIGINS, PORT, STORAGE_*, AI_ENABLED, ANTHROPIC_API_KEY,
    AI_MONTHLY_CAP); errors list variable names only, never values.
  - `errors` — `AppError` + central handler; every error is `{ error: { code, message, details? } }`.
    Zod → 422 `VALIDATION_FAILED`, bad JSON → 400 `MALFORMED_JSON`, unknown → 500 `INTERNAL_ERROR`
    (message not leaked), unknown route → 404 `ROUTE_NOT_FOUND`.
  - `http` — `asyncHandler`, pagination (`?page=&pageSize=`, max 100).
  - `middleware` — helmet, CORS allow-list, pino-http (credentials redacted), global rate limiter,
    `validate({ body, query, params })`.
  - `db` — Prisma client with `connection_limit=5` added to the URL; `Tx` type.
  - `audit`, `settings` — placeholders for Sprint 1.
  - `createApp()` separate from `server.ts` (graceful shutdown). Routes under `/api/v1`.
  - `GET /api/v1/health` (and `/health` for uptime pingers): `SELECT 1` with 2 s timeout →
    200 `{status:"ok",db:"ok"}` or 503 `{status:"degraded",db:"error"}`.
  - `openapi.yaml` with info, servers, Error/PageMeta schemas, common responses, `/health`.
- **Prisma**: placeholder `User` model, initial migration, connection-check seed;
  `docker-compose.yml` with `pgvector/pgvector:pg16` and a separate `vtmp_test` database for
  integration tests.
- **Shared**: enums for Role, Locale, EnrollmentStatus (+ inactive set for BR-01), BatchStatus,
  SessionStatus, AttendanceStatus, AssessmentMode, CertificateStatus, RiskLevel, Grade,
  InterventionActionType, LearningResourceType, AllocationPriorityRule, OpportunityType;
  API error/pagination/health schemas.
- **Web shell**: Vite + React 18 + Router + Tailwind + TanStack Query + react-i18next.
  Skip link, top bar with app name and language switcher (persisted), responsive sidebar
  (toggle on mobile), footer, 404 page, error boundary, toast system (live regions).
  Design system in `components/ui`: Button, Input, Select, Table, Card, Badge, Modal (native
  `<dialog>`), EmptyState, Spinner — visible focus states, AA-contrast tones. Fetch API client
  with typed `ApiError`, in-memory token hook for Sprint 2. Home page shows live API/DB status.
- **i18n**: `locales/{en,or,hi}/<namespace>.json` loaded per file on demand via
  `import.meta.glob`; `or`/`hi` are empty copies that fall back to English.
  `i18n:sync` script mirrors new keys; `i18n:check` runs in CI.
- **Tooling**: ESLint 9 flat config (typescript-eslint, react-hooks, jsx-a11y, rule banning
  `dangerouslySetInnerHTML`), Prettier, Jest (unit + integration projects), Playwright
  (desktop + mobile) with axe-core, GitHub Actions CI (quality → unit + integration with
  PostgreSQL → build + e2e; deploy job stubbed).

### Deviations
- Seed is a connection check only; real seed data is Sprint 1 scope.
- `CLAUDE.md` and the sprint prompts are kept locally (git-ignored) by team choice.
- Health also lives at `/health` (outside `/api/v1`) for uptime monitors (TAD §13).

### Known gaps / follow-ups
- Main JS chunk is ~594 kB minified / ~177 kB gzip. Fine for NFR-10 (<500 kB transferred) but
  route-level code splitting is due in Sprint 12.
- Playwright needs `playwright install chromium` once per machine.

### Definition of done
- [x] lint · [x] format · [x] typecheck · [x] build
- [x] tests: 17 unit + 1 integration (real PostgreSQL) · 8 e2e (desktop + mobile, axe clean)
- [x] `pnpm db:up && pnpm dev` → web shows the shell, `GET /api/v1/health` →
      `{status:"ok",db:"ok"}` · migration applies on a clean DB · seed runs
- [x] openapi.yaml · [x] strings externalized · [x] language switcher persists

### Notes for the next session
- Prisma Client is generated by the **root** `postinstall` only. Letting `@prisma/client` and
  `apps/api` both generate during install raced and left an uninitialised client.
