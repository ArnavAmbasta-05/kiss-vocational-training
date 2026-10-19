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

## Sprint 4 — Batches, allocation engine, trainers, sessions (done, 2026-10-19)

### Built
- **Allocation engine** (`modules/batches/rules.ts allocate`, pure, O(n log n + n·p)):
  - Applicants are sorted once by `allocation.priorityRule`: submission time, or CGPA desc
    with submission time and then id breaking ties, so results are deterministic.
  - It fills rank 1 for everyone, then rank 2 for anyone still unplaced, then rank 3 (BR-04).
    Each student goes to the batch of that course with the most free seats, so batches fill
    evenly.
  - No batch exceeds capacity (BR-03), and the overflow is waitlisted.
  - Tested for capacity, rank order, both rules, ties, spreading and 500 applicants < 5 s (BO-3).
- **Preview → confirm** (`allocation.service`):
  - Preview stores a snapshot in `allocation_previews` (serverless-safe) with a fingerprint of
    the approved applications (incl. `updatedAt`), batch capacity/status/members and the rule.
    It expires after setting `allocation.previewTtlMinutes` (30).
  - Confirm locks the cycle's batches, recomputes the fingerprint (409 `PREVIEW_STALE` on any
    change) and, in ONE transaction:
    - bulk-inserts the memberships;
    - sets APPROVED → ALLOCATED (or ACTIVE if the batch is active), and the overflow →
      WAITLISTED with a reason;
    - writes per-application audit rows plus `ALLOCATION_CONFIRMED`, and notifications.
  - Confirm also handles 409 `PREVIEW_EXPIRED` and `PREVIEW_ALREADY_CONFIRMED`, and accepts an
    Idempotency-Key (the UI uses `alloc-<previewId>`).
- **Batches** (`batches.service`):
  - Admin CRUD. Capacity is never below enrolled (409 `CAPACITY_BELOW_ENROLLED`), and names
    are unique per course and cycle.
  - Placement:
    - Place an APPROVED/WAITLISTED applicant ("promote"). The course must be one they chose,
      in the same cycle, with capacity left (409 `BATCH_FULL`, TC-06).
    - Move, with the same checks on the target (TC-07). Batch rows are locked in id order so
      moves cannot deadlock.
    - Remove from a planned batch, which returns the application to APPROVED.
  - Trainers: assign and unassign (an active batch keeps one).
  - Activate: PLANNED → ACTIVE, which needs a trainer. Students go ALLOCATED → ACTIVE and are
    notified.
  - Sessions: single, or weekly recurring (days, HH:MM, from/until) expanded in institution
    local time (new setting `institution.utcOffsetMinutes` = 330, IST). Sessions must lie within
    the batch dates (≤ 200 per schedule). Cancel is supported.
  - Read endpoints `/batches/mine`, `/batches/:id` and `/batches/:id/sessions` are
    ownership-checked: admin any batch, trainer their own (BR-05), student their own batch with
    the roster hidden (NFR-08).
- **Enrollments service exports for batches** (rule 5: batches never touch enrollment tables):
  - `approvedApplicants`, `placementFacts` and `candidatesForCourse`.
  - Set-based `changeStatuses(tx, log, …)`: conditional grouped updates, abort on any
    concurrent change, and bulk audit via the new `log.many()` / `audit.recordMany()`.
- **Catalogue seats** now = students placed in the course's batches + approved first choices
  not yet placed.
- **Web**:
  - **Admin**: Batches list (filters, fill bars, create), Run allocation (stats, warnings,
    batch fill with "added now", placements, waitlist, confirm dialog) and Batch detail
    (accessible tabs: Students with place/move/remove and candidate list, Trainers with
    assign/unassign, Sessions with list/calendar toggle, schedule dialog and cancel; edit;
    activate).
  - **Trainer**: My batches and a read-only batch detail.
  - **Student**: a dashboard card with batch, trainer, venue and next session.
  - Session times are always shown in IST.
- **Seed**: "Batch A" per demo course in the open cycle with its trainer assigned (Electrician →
  trainer1, Solar → trainer2, Tailoring → trainer3), ready for an allocation demo.

### Deviations
- **Previews are stored in Postgres**, not in memory, because of serverless hosting.
- **Moves and placements are limited to courses the student chose**; that rule isn't in the
  BRD, but it stops placing students in courses they never asked for.
- **The client shows times in Asia/Kolkata**, a constant that mirrors the server setting; a
  different institution time zone would need both changed.
- **Clash and double-booking checks are not here** (Sprint 11, F14).

### Known gaps / follow-ups
- Main JS bundle is still under NFR-10 but growing. Route-level code splitting should come
  soon.
- Removing a student from an ACTIVE batch is blocked; withdrawals mid-training will be handled
  with attendance/completion (Sprint 5–6).

### Definition of done
- [x] Approved students allocated via preview → confirm; the trainer sees the roster; the
      student sees their batch (Playwright desktop + mobile, axe on allocation, batch detail
      and trainer pages)
- [x] Unit: allocation (capacity, rank order, both priority rules, ties, spread, 500 < 5 s),
      recurring schedule (IST, crossing UTC midnight, limits)
- [x] API: stale/expired/double confirm, idempotent replay, 500 applicants preview < 5 s and
      confirm, TC-06 batch full, TC-07 move capacity, remove, promote, wrong course, trainer
      sees only own batches, student without roster, activation rules, sessions
- [x] lint · format · typecheck · build · i18n keys in sync · openapi.yaml (47 paths)

---

## Sprint 3 — Courses, electives and enrollment (done, 2026-10-19)

### Built
- **`modules/courses`**:
  - **Catalogue** (`GET /courses?cycleId=`, `GET /courses/:id`, `GET /cycles`; any signed-in
    user): active courses offered in the cycle with description, duration, prerequisites,
    capacity, indicative seats remaining and window state. The default cycle is the newest one
    with offerings.
  - **Admin**: course CRUD with soft deactivate (409 `COURSE_CODE_TAKEN`), cycles
    (409 `CYCLE_NAME_TAKEN`), and `PUT /admin/cycles/:cycleId/offerings/:courseId` to offer a
    course and set its window and open/close toggle (BRQ-2.3). Every change is audited.
  - **Window rule** (`rules.ts windowState`): the window is OPEN only when the toggle is on AND
    opensAt ≤ now < closesAt. Boundary unit tests cover it.
- **`modules/enrollments`**:
  - **Student**: `POST /enrollments` takes 1–3 ranked, distinct courses. It returns 409
    `ENROLLMENT_WINDOW_CLOSED` if any chosen course is inactive, not offered, toggled off,
    upcoming or past (BR-02), 409 `DUPLICATE_ENROLLMENT` for BR-01 (the DB partial index's
    P2002 is mapped to it), and 422 `TOO_MANY_PREFERENCES` above setting
    `enrollment.maxPreferences`. `PUT /enrollments/:id` and `POST /enrollments/:id/withdraw`
    work only while PENDING and every window is open. `GET /enrollments/me` returns status,
    reason and a timeline built from the audit trail.
  - **Admin review**: `GET /admin/enrollments` (cycle/course/status/search filters, oldest
    first, paginated) and approve/reject (reason required)/waitlist, single or
    `POST /admin/enrollments/bulk` (≤ 200).
    - One transaction for the whole batch: any unknown id (404) or invalid transition (409)
      rolls it all back.
    - A conditional update per row aborts the batch on a concurrent change.
    - Every change writes an audit row and a student notification in the same transaction.
    - Transitions (`rules.ts canReview`): PENDING → APPROVED/REJECTED/WAITLISTED, and
      WAITLISTED → APPROVED/REJECTED.
- **`core/middleware/idempotency`** (reusable): a Postgres-backed Idempotency-Key, scoped per
  user. The 2xx response is stored before it is sent, and a retry gets it back with
  `Idempotent-Replayed: true`. The same key with a different request gives 422
  `IDEMPOTENCY_KEY_REUSED`, and a key still in flight gives 409. On error the key is released.
  Keys are kept 24 h. Used on submit, approve/reject/waitlist and bulk.
- **`modules/notifications`**: `notify(tx, …)` inside the business transaction; `GET
  /notifications/me` (+ unread count), mark one / all read (scoped per user, someone else's →
  404). Stored as `type` + `data` so the web app renders them through `t()`.
- **`core/audit.history()`**: read-only audit trail per record (used for the status timeline).
- **Web**:
  - **Student**: course catalogue (search, "open only", seats badge, window countdown via
    `Intl.RelativeTimeFormat`), course detail, and an apply/edit page with up to 3 ranked
    choices (keyboard-accessible move up/down, not drag-only). My Enrollment has status,
    reason, timeline, edit and withdraw.
  - **Admin**: Courses & cycles (course table and form, activate/deactivate, cycle create,
    per-course window editor with datetime inputs and open toggle) and Enrollments (filters,
    checkboxes, per-row and bulk actions, reason dialog, fresh Idempotency-Key per action).
  - **All roles**: a notification bell with unread count, polling every 60 s.
- **Data**:
  - Migrations add `WITHDRAWN` and `notifications.data`, and rebuild the BR-01 index so it
    also ignores WITHDRAWN (a separate migration, because Postgres can't use a new enum
    value in the same transaction).
  - The seed adds pending applications for students 031–060. Students 001–030 stay free for
    demos and e2e.
- **Docs**: the Word TAD (`docs/KISS_VTMP_TAD_v1.0.docx`) got the same Amendment 1 as
  `docs/TAD.md`, and passes schema validation. Its only Render/Railway mention is the amendment
  note.

### Deviations
- **`WITHDRAWN` status** added, so students can withdraw a pending application and re-apply.
  It doesn't count as active for BR-01.
- **Seats remaining is indicative**: capacity minus approved-or-later applications counted
  against their first preference. Approval isn't tied to a course until allocation, and
  Sprint 4 switches to real batch membership.
- **Notifications are polled** (60 s), not pushed, because there's no long-lived connection on
  serverless hosting.
- The default review filter is PENDING, so the queue opens on work to do.

### Known gaps / follow-ups
- No drag-and-drop ranking: up/down buttons cover the same need accessibly.
- Prerequisites are informational text; nothing checks them automatically (the BRD doesn't
  define a machine-checkable prerequisite).
- Main JS bundle is 769 kB (213 kB gzip). That's within NFR-10's 500 kB transferred, but it
  grows each sprint. Route-level code splitting (planned for Sprint 12) should come earlier if
  it passes ~300 kB gzip.

### Definition of done
- [x] A seeded student applies, the admin approves, and the student sees APPROVED at once
      (Playwright, desktop + mobile, with axe on catalogue, apply, my enrollment and admin pages)
- [x] TC-03 (window closed: closed/off/upcoming/inactive/not offered), TC-04 (duplicate,
      re-apply after withdraw), TC-05 (edit after close; bulk rollback on an unknown id and on
      an invalid transition), audit rows, idempotent replay, notifications
- [x] lint · format · typecheck · build · i18n keys in sync · openapi.yaml (30 paths)

---

## Sprint 2 — Auth, RBAC, ownership, role dashboards, first deploy (done, 2026-10-19)

### Built
- **`core/auth`** (kernel shared by all modules): bcrypt hashing (cost from `BCRYPT_ROUNDS`,
  default 12) with a timing-equalising check for unknown emails; HS256 access JWT, 15 min,
  issuer/audience checked; refresh tokens = 32 random bytes, stored as a keyed SHA-256 hash,
  7 days; `authenticate` reloads the user on every request (deactivation and role changes apply
  immediately); `authorize(...roles)`; `requireOwnership(resolver)` with reusable resolvers
  `isOwnStudent`, `canAccessBatch` (BR-05), `canAccessSession`, `canAccessAssessment` and
  predicates `trainerOwnsBatch`, `trainerTeachesStudent`. Unknown id → 404, someone else's → 403.
- **`modules/auth`**: `POST /auth/login` (generic "Invalid email or password" for wrong
  password, unknown email and inactive account; lockout after `auth.maxFailedLogins` for
  `auth.lockMinutes` → 429 `ACCOUNT_LOCKED`, audited as `USER_LOCKED`; per-IP limit on failed
  attempts), `POST /auth/refresh` (rotation on every use, token families, reuse → whole family
  revoked, race-safe conditional claim), `POST /auth/logout`, `GET /auth/me`. Cookie
  `vtmp_rt`: httpOnly, SameSite=Strict, path `/api/v1/auth`, Secure in production.
- **`modules/users`**: `PATCH /users/me` (name, locale, phone; strict schema blocks role/email
  changes), `POST /users/me/password` (verifies current, signs out other sessions, keeps this
  one), admin `GET/POST/PATCH /admin/users` (search, role/status filters, pagination;
  role-specific create with 409 `EMAIL_TAKEN`/`ROLL_NO_TAKEN`/`EMPLOYEE_CODE_TAKEN`;
  deactivate revokes sessions, reactivate clears lock, no self-deactivation). All writes audited,
  never with password material. Shared Zod schemas in `packages/shared/src/schemas/auth.ts`.
- **Web**: `AuthProvider` (access token in memory only, session restored from the cookie on
  load, proactive refresh 1 min before expiry, single-flight refresh, 401 → refresh → retry
  once), `RequireAuth` (→ `/login?next=`), `RequireRole` (→ 403 page), login page (RHF + shared
  Zod), role layouts with per-role sidebar, account menu, dashboards with quick links, "coming
  soon" pages for later features, profile + change-password pages, admin Users page (search,
  filters, pagination, create modal with role-specific fields, deactivate confirm). Language
  switch is saved to `User.locale` and applied at login.
- **Deploy prep (Vercel + Neon, revised 2026-10-19)**: one Vercel project serves the SPA and
  runs the Express API as a serverless function. Root `vercel.json` routes `/api/*` and
  `/health` to `api/index.js` → `apps/api/dist/vercel.js` (bundled `createApp()`), the rest to
  the SPA, region sin1 next to Neon. `scripts/vercel-build.sh` runs migrations (production only,
  direct URL), then builds API and web. Failed-login limits now use a Postgres-backed store
  (`rate_limits` table, hashed keys, `RATE_LIMIT_STORE`, default postgres in production) so all
  function instances share one count. Also `TRUST_PROXY_HOPS`, `SEED_PASSWORD` override,
  `docs/DEPLOYMENT.md`, and a CI job that smoke-tests the live site once `PUBLIC_BASE_URL` is set.
  Locally and in CI the API still runs as a normal server.

### NFR-04: three clicks from the dashboard
Every navigation entry is one click from each dashboard (sidebar + quick links). Profile and
password are two clicks via the account menu.

### Deviations
- Auth middleware and ownership resolvers live in `core/auth` (kernel), not `modules/auth`,
  so every module can use them without importing another module.
- Per-IP limit counts **failed** logins only (`skipSuccessfulRequests`); refresh is not
  IP-limited beyond the global limiter. Counting every `/auth` call would lock out normal users,
  since each page load refreshes. New setting `auth.ipRateLimitPer15Min` (50).
- Locked accounts get 429 `ACCOUNT_LOCKED` rather than the generic 401, so a real user knows to
  wait. This reveals that a locked email exists; accepted for usability.
- **Hosting: Vercel + Neon only, no Render** (TAD §4/§11 named Render/Railway as examples).
  Render requires a card, and the team's card was declined. Consequences, carried into the
  sprint plan:
  - Rate limits that protect security use the Postgres store (failed logins now; the public
    router in Sprint 9).
  - The Sprint 10 nightly risk job runs from Vercel Cron (once a day on Hobby, may run up to
    ~1 h late), with node-cron kept for local runs.
  - Certificate PDFs and evidence (Sprint 6, 11) go to an object store, because there is no
    persistent disk.
  - Request time is capped at 30 s.
- CI does not push deploys itself. Vercel deploys `main` through its GitHub integration (and
  migrates first), and CI smoke-tests the live site afterwards.
- Refresh in two tabs at the exact same moment can trigger reuse detection and sign both out
  (documented trade-off of strict rotation).

### First deploy (2026-10-19)
- Live at **https://kiss-vtmp.vercel.app** (Vercel Hobby, function region sin1; Neon Postgres
  16, Singapore). Migrations ran in the production build, the demo data was seeded, and admin,
  trainer and student each signed in to their own dashboard. `PUBLIC_BASE_URL` is now fixed.
- Issues fixed on the way:
  - `NODE_ENV` pasted with stray characters failed config validation, so values are now
    normalised.
  - The install now keeps dev dependencies when `NODE_ENV=production`
    (`--production=false`).
  - CORS rejected same-origin POSTs from Vercel per-deployment URLs, so same-origin requests
    now always pass.
- Credentials hygiene:
  - The Neon password was shared in a chat and also used as the first demo password. The
    Neon password has been rotated.
  - All seeded accounts got a new demo password via the new `pnpm db:seed --reset-passwords`
    (audited, revokes sessions).
  - GitHub has the variable `PUBLIC_BASE_URL` and the secret `E2E_PASSWORD`, so CI
    smoke-tests the live site after each push to main.

### Known gaps / follow-ups
- Password reset by email is out of scope (BRD); admins can create accounts and reactivate.

### Definition of done
- [x] lint · format · typecheck · build · i18n keys in sync
- [x] API tests incl. TC-01, TC-02, TC-15, lockout, rotation, reuse detection,
      expired/forged tokens, trainer → other batch 403, shared Postgres rate-limit store
- [x] 17 Playwright tests (desktop + mobile), axe clean on login, dashboards and Users
- [x] openapi.yaml: /auth/*, /users/me*, /admin/users*
- [x] All three roles sign in on the deployed URL (https://kiss-vtmp.vercel.app)

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
