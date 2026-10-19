# Deployment

The demo runs on two free tiers. Neither asks for a card.

| Part | Host | Config in repo |
| --- | --- | --- |
| Web (React SPA) **and** API (Express) | **Vercel** (Hobby), one project | `vercel.json`, `api/index.js`, `scripts/vercel-build.sh` |
| Database (PostgreSQL 16) | **Neon** (Free), Singapore | `prisma/migrations` |

```
browser ──▶ https://kiss-vtmp.vercel.app
              ├─ static files (apps/web/dist, SPA fallback to /index.html)
              └─ /api/* and /health ──▶ serverless function api/index.js (region sin1)
                                          └─ bundled Express app (apps/api/dist/vercel.js)
                                               └──▶ Neon pooled URL (Singapore)
```

The TAD (§4, §11) names Render/Railway for the API as examples. We moved the API onto Vercel
because Render requires a card (docs/PROGRESS.md, Sprint 2). The Express app is unchanged:
locally and in CI it still runs as a normal server (`apps/api/src/server.ts`).

## What serverless changes

| Concern | How it is handled |
| --- | --- |
| Refresh cookie (`SameSite=Strict`) | The site and API share one origin, so the cookie is always same-site and no CORS is involved |
| Rate limits | Security limiters (failed logins now; the public router in Sprint 9) store counts in the `rate_limits` table (`RATE_LIMIT_STORE=postgres`, the production default), so every function instance shares one limit. The generous global flood limiter stays in memory |
| Database connections | Neon's pooled URL with `connection_limit=1` per function instance |
| Migrations | Run in the production build (`scripts/vercel-build.sh`) against the direct URL, before the new code goes live |
| Scheduled jobs (Sprint 10) | Vercel Cron, once a day on Hobby (may fire up to ~1 h late), calling a secret-protected API route. node-cron is used only locally |
| Files (Sprint 6+) | No persistent disk, so PDFs and evidence go to an object store (chosen in Sprint 6) |
| Request time | Function limit set to 30 s (`vercel.json`). Bulk operations are designed to finish well inside it |

## One-time setup

### 1. Database (Neon)

1. Project `kiss-vtmp`, region **AWS Asia Pacific (Singapore)**, **Postgres 16**. The database
   is `neondb`.
2. **Connect** → copy two strings and remove `&channel_binding=require` from both:
   - **Pooled** (host contains `-pooler`): add `&pgbouncer=true&connection_limit=1`. This is
     `DATABASE_URL`.
   - **Direct** (pooling off). This is `DIRECT_DATABASE_URL`, used only for migrations.
3. Keep both private. If a password is ever pasted somewhere public (or into a chat), reset it
   in Neon (**Roles → neondb_owner → Reset password**) and update Vercel.

### 2. Generate the two secrets (on your machine)

Run this twice and keep each output for the next step. Don't commit or share them.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Vercel project

1. https://vercel.com → sign in with GitHub → **Add New → Project** → import
   `ShashankSinghhh/kiss-vocational-training`.
2. **Project name:** `kiss-vtmp`, which gives the URL `https://kiss-vtmp.vercel.app`. If that
   name is taken, pick another and use its URL everywhere below.
3. **Root Directory:** leave it as the repository root (`./`). Framework preset: **Other**.
   Leave the build and output settings alone, because `vercel.json` sets them.
4. **Environment Variables:** add these for the **Production** environment only:

   | Key | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Neon pooled URL (step 1) |
   | `DIRECT_DATABASE_URL` | Neon direct URL (step 1) |
   | `JWT_SECRET` | first generated secret |
   | `REFRESH_SECRET` | second generated secret |
   | `PUBLIC_BASE_URL` | `https://kiss-vtmp.vercel.app` |
   | `CORS_ORIGINS` | `https://kiss-vtmp.vercel.app` |
   | `TRUST_PROXY_HOPS` | `1` |
   | `AI_ENABLED` | `false` |

   Leave Preview without database variables. Preview deployments then show the web app only and
   never touch (or migrate) the production database.
5. **Settings → Functions → Function Region:** make sure it shows **Singapore (sin1)**.
   `vercel.json` requests it, and it keeps the API next to Neon.
6. Click **Deploy**. The build applies migrations, then builds the API bundle and the web app.
7. Check `https://kiss-vtmp.vercel.app/api/v1/health` → `{"status":"ok","db":"ok",…}`.

### 4. Seed the demo data (once)

Run this from your machine against the **direct** URL, with a strong demo password because the
site is public:

```bash
DATABASE_URL="<neon direct url>" SEED_PASSWORD="<strong demo password>" pnpm db:seed
```

In PowerShell: `$env:DATABASE_URL="…"; $env:SEED_PASSWORD="…"; pnpm db:seed`, then close the
terminal. The seed is idempotent. Share the demo password only with the team and examiners.

### 5. Freeze `PUBLIC_BASE_URL`

Certificate QR codes (Sprint 6) encode `PUBLIC_BASE_URL/verify/<code>`. **Never change it**
once set (BRD §14, TAD §15.1). If a custom domain is added later, keep the `*.vercel.app` address
working too.

### 6. GitHub (CI smoke test of the live site)

**Settings → Secrets and variables → Actions**:

- Variable `PUBLIC_BASE_URL` = the site URL
- Secret `E2E_PASSWORD` = the demo seed password

Every push to `main` then runs the CI job **Smoke test the deployed site** (read-only checks).

## Releasing

Push or merge to `main`. Vercel builds and deploys it automatically, and migrations run first.
Pull requests get Vercel preview URLs for the web app (no API, see step 3.4).

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Build fails: `DIRECT_DATABASE_URL must be set` | Add it to the **Production** environment variables |
| Build fails at `migrate deploy` | Direct URL is wrong or is the pooled one |
| `/api/v1/health` returns 503 | `DATABASE_URL` is wrong, or Neon is waking up (first request after idle). Retry |
| `401 INVALID_TOKEN` for everyone after a change | `JWT_SECRET` changed. Users just sign in again |
| Everyone gets `429 RATE_LIMITED` on login | `TRUST_PROXY_HOPS` must be `1` on Vercel, otherwise every visitor looks like one IP |
| Signed out on every reload | Open the site via its Vercel URL. The refresh cookie only works on that origin |
| Function error: Prisma engine not found | Redeploy without cache. `vercel.json` `includeFiles` must still match the Prisma client path |

## Security checklist

- [ ] Secrets only in Vercel's environment variables. `.env` is git-ignored.
- [ ] Neon password reset if it was ever shared outside Neon/Vercel.
- [ ] Demo seed password is not `Password@123`.
- [ ] Admin password changed after the first sign-in on production.
- [ ] `NODE_ENV=production` (Secure cookie, HSTS, Postgres rate-limit store).
