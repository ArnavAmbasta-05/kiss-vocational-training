# KISS Vocational Training Management Portal (VTMP)

Takes every vocational student at KISS from enrollment to a verifiable certificate and Skill
Passport. Software Engineering project by
[@ShashankSinghhh](https://github.com/ShashankSinghhh) and
[@ArnavAmbasta-05](https://github.com/ArnavAmbasta-05).

- **Business rules:** [docs/BRD.md](docs/BRD.md) (BR-01…BR-22, BRQ-x.y, NFRs)
- **Architecture:** [docs/TAD.md](docs/TAD.md)
- **Sprint log:** [docs/PROGRESS.md](docs/PROGRESS.md)
- **API contract:** [apps/api/openapi.yaml](apps/api/openapi.yaml)

## Stack

| Part                       | Technology                                                          |
| -------------------------- | ------------------------------------------------------------------- |
| Web (`apps/web`)           | React 18, Vite, React Router, Tailwind CSS, TanStack Query, i18next |
| API (`apps/api`)           | Node.js 20, Express, Zod, Prisma, pino, helmet                      |
| Database                   | PostgreSQL 16 (pgvector image) via Docker                           |
| Shared (`packages/shared`) | Zod schemas, status enums and types used by both apps               |
| Tests                      | Jest + Supertest (API), Playwright + axe-core (browser)             |

## Setup

You need **Node.js 20+**, **pnpm 9** (`npm i -g pnpm@9`) and **Docker Desktop** (running).

```bash
pnpm install
cp .env.example .env        # dev defaults work as-is
pnpm db:up                  # start PostgreSQL in Docker
pnpm db:migrate             # apply migrations
pnpm db:seed                # load demo data
pnpm dev                    # API on :4000, web on :5173
```

Open http://localhost:5173. The home page shows whether the API and database are reachable;
`GET http://localhost:4000/api/v1/health` should return `{"status":"ok","db":"ok",…}`.

Seed accounts (dev only) will be listed here from Sprint 1.

## Scripts

| Command                                        | What it does                                         |
| ---------------------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                                     | Run API and web together with hot reload             |
| `pnpm db:up` / `pnpm db:down`                  | Start / stop the PostgreSQL container                |
| `pnpm db:migrate`                              | Create and apply Prisma migrations (dev)             |
| `pnpm db:seed`                                 | Load seed data                                       |
| `pnpm test`                                    | All API tests (unit + integration; needs `db:up`)    |
| `pnpm test:unit`                               | API unit tests only (no database needed)             |
| `pnpm test:e2e`                                | Playwright browser tests (starts the web dev server) |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Code quality                                         |
| `pnpm build`                                   | Production builds of API and web                     |
| `pnpm --filter @vtmp/web i18n:sync`            | Copy new English UI keys into the Odia/Hindi files   |

Run Playwright once with `pnpm --filter @vtmp/web exec playwright install chromium` before the
first `pnpm test:e2e`.

## Repository layout

```
apps/api/src/core/      config, errors, http, middleware, db, audit, settings (shared kernel)
apps/api/src/modules/   one folder per module: routes, controller, service, schema, __tests__
apps/web/src/           components/ui (design system), features/<module>, locales/{en,or,hi}
packages/shared/src/    enums, schemas, types shared by API and web
prisma/                 schema.prisma, migrations, seed.ts
docs/                   BRD, TAD, progress log and project documents
```

## Working together

- `main` is the deployed branch; work on a feature branch and open a pull request.
- CI (GitHub Actions) runs lint, typecheck, unit tests, integration tests against PostgreSQL,
  the production build and the browser smoke tests on every push and pull request.
- UI text never goes in components: add keys to `apps/web/src/locales/en/*.json` and use `t()`.
- Never commit `.env` or real secrets.
