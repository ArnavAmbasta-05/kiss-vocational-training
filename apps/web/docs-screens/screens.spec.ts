import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'screenshots');
const PASSWORD = 'Password@123'; // the local seed password; this runs on vtmp_docs only
const ADMIN = 'admin@kiss-vtmp.test';
const TRAINER = 'trainer1@kiss-vtmp.test';
const STUDENT = 'student021@kiss-vtmp.test'; // in the seeded pilot batch, eligible to complete

test.describe.configure({ mode: 'serial' });
mkdirSync(OUT, { recursive: true });

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Opens a page, waits until it has settled, and saves a JPEG for the guide. */
async function shot(page: Page, name: string, path?: string) {
  if (path) await page.goto(path);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1').first()).toBeVisible();
  await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 70 });
}

async function token(request: APIRequestContext, email: string) {
  const res = await request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
  return { Authorization: `Bearer ${(await res.json()).accessToken as string}` };
}

let publicCode = '';

test('prepare: issue one certificate, run the daily risk check, refresh analytics', async ({
  request,
}) => {
  const A = await token(request, ADMIN);
  const batchesRes = await (await request.get('/api/v1/admin/batches', { headers: A })).json();
  const batches = (Array.isArray(batchesRes) ? batchesRes : batchesRes.items) as Array<{
    id: string;
    name: string;
  }>;
  const pilot = batches.find((b) => b.name === 'Pilot batch')!;
  const queue = await request.get(`/api/v1/completions/queue?batchId=${pilot.id}`, { headers: A });
  const rows = (await queue.json()) as Array<{ enrollmentId: string; eligible: boolean }>;
  const row = rows.find((r) => r.eligible)!;
  const approved = await request.post(`/api/v1/completions/${row.enrollmentId}/approve`, {
    headers: { ...A, 'Idempotency-Key': `docs-${row.enrollmentId}` },
  });
  expect([200, 201]).toContain(approved.status());
  publicCode = (await approved.json()).certificate.publicCode as string;
  await request.post('/api/v1/risk-flags/evaluate', { headers: A });
  await request.post('/api/v1/analytics/refresh', { headers: A });
});

test('public pages', async ({ page }) => {
  await shot(page, 'public-login', '/login');
  await shot(page, 'public-verify', `/verify/${publicCode}`);
});

test('student', async ({ page }) => {
  await signIn(page, STUDENT);
  await shot(page, 'student-dashboard', '/student');
  await shot(page, 'student-courses', '/student/courses');
  await shot(page, 'student-training', '/student/training');
  await shot(page, 'student-skills', '/student/skills');
  await shot(page, 'student-passport', '/student/passport');
  await shot(page, 'student-opportunities', '/student/opportunities');
  await shot(page, 'student-certificates', '/student/certificates');
});

test('trainer', async ({ page }) => {
  await signIn(page, TRAINER);
  await shot(page, 'trainer-dashboard', '/trainer');
  await shot(page, 'trainer-sessions', '/trainer/sessions');
  await page
    .getByRole('link', { name: /^(Take|View) attendance for/ })
    .first()
    .click();
  await shot(page, 'trainer-attendance');
  await shot(page, 'trainer-assessments', '/trainer/assessments');
  await shot(page, 'trainer-competencies', '/trainer/competencies');
  await shot(page, 'trainer-at-risk', '/trainer/at-risk');
});

test('admin', async ({ page }) => {
  await signIn(page, ADMIN);
  await shot(page, 'admin-dashboard', '/admin');
  await shot(page, 'admin-enrollments', '/admin/enrollments');
  await shot(page, 'admin-batches', '/admin/batches');
  await shot(page, 'admin-completions', '/admin/completions');
  await shot(page, 'admin-certificates', '/admin/certificates');
  await shot(page, 'admin-at-risk', '/admin/at-risk');
  await shot(page, 'admin-opportunities', '/admin/opportunities');
  await shot(page, 'admin-reports', '/admin/reports');
  await shot(page, 'admin-analytics', '/admin/analytics');
  await shot(page, 'admin-audit', '/admin/audit');
});

test('phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, STUDENT);
  await shot(page, 'phone-student-training', '/student/training');
  await shot(page, 'phone-student-passport', '/student/passport');
});
