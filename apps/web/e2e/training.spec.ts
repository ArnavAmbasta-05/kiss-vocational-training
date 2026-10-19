import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { ACCOUNTS, SEED_PASSWORD, expectNoSeriousA11yViolations, signIn } from './helpers';

async function token(request: APIRequestContext, email: string, password: string) {
  const res = await request.post('/api/v1/auth/login', { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return `Bearer ${((await res.json()) as { accessToken: string }).accessToken}`;
}

/**
 * Builds an isolated ACTIVE batch through the API: started a few days ago, two placed
 * students, the seeded trainer assigned, and one session that began an hour ago.
 */
async function setup(request: APIRequestContext) {
  const admin = await token(request, ACCOUNTS.ADMIN, SEED_PASSWORD);
  const h = { headers: { Authorization: admin } };
  const s = Date.now().toString(36);
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const ok = async <T>(res: Promise<APIResponse>): Promise<T> => {
    const r = await res;
    expect(r.ok(), `${r.url()} → ${r.status()} ${await r.text()}`).toBeTruthy();
    return (r.status() === 204 ? undefined : await r.json()) as T;
  };

  const cycle = await ok<{ id: string }>(
    request.post('/api/v1/admin/cycles', {
      ...h,
      data: { name: `E2E training ${s}`, startsOn: day(-10), endsOn: day(60) },
    }),
  );
  const course = await ok<{ id: string; title: string }>(
    request.post('/api/v1/admin/courses', {
      ...h,
      data: {
        code: `TR-${s}`.slice(0, 20),
        title: `Plumbing ${s}`,
        description: 'Pipe fitting for e2e tests.',
        durationWeeks: 8,
        seatCapacity: 20,
      },
    }),
  );
  await ok(
    request.put(`/api/v1/admin/cycles/${cycle.id}/offerings/${course.id}`, {
      ...h,
      data: {
        enrollmentOpensAt: new Date(Date.now() - 3_600_000).toISOString(),
        enrollmentClosesAt: new Date(Date.now() + 86_400_000).toISOString(),
        isOpen: true,
      },
    }),
  );
  const batch = await ok<{ id: string }>(
    request.post('/api/v1/admin/batches', {
      ...h,
      data: {
        courseId: course.id,
        cycleId: cycle.id,
        name: 'Evening',
        capacity: 5,
        startDate: day(-5),
        endDate: day(50),
        venue: 'Workshop C',
      },
    }),
  );

  const students = [];
  for (let i = 0; i < 2; i++) {
    const student = {
      email: `e2e-train-${s}-${i}@kiss-vtmp.test`,
      password: 'E2e-Train-Pass1',
      fullName: `Trainee ${s} ${i}`,
    };
    await ok(
      request.post('/api/v1/admin/users', {
        ...h,
        data: { role: 'STUDENT', ...student, rollNo: `TR-${s}-${i}`, cgpa: 8 },
      }),
    );
    const auth = await token(request, student.email, student.password);
    const enrollment = await ok<{ id: string }>(
      request.post('/api/v1/enrollments', {
        headers: { Authorization: auth },
        data: { cycleId: cycle.id, courseIds: [course.id] },
      }),
    );
    await ok(request.post(`/api/v1/admin/enrollments/${enrollment.id}/approve`, h));
    await ok(
      request.post(`/api/v1/admin/batches/${batch.id}/students`, {
        ...h,
        data: { enrollmentId: enrollment.id },
      }),
    );
    students.push(student);
  }

  const trainers = await ok<Array<{ id: string; fullName: string }>>(
    request.get('/api/v1/admin/trainers', h),
  );
  const trainer = trainers.find((t) => t.fullName === 'Sushant Mohanty')!;
  await ok(
    request.post(`/api/v1/admin/batches/${batch.id}/trainers`, {
      ...h,
      data: { trainerId: trainer.id },
    }),
  );
  await ok(
    request.post(`/api/v1/admin/batches/${batch.id}/sessions`, {
      ...h,
      data: {
        kind: 'single',
        startsAt: new Date(Date.now() - 3_600_000).toISOString(),
        endsAt: new Date(Date.now() + 3_600_000).toISOString(),
        topic: `Joints ${s}`,
      },
    }),
  );
  await ok(
    request.post(`/api/v1/admin/batches/${batch.id}/activate`, {
      headers: { ...h.headers, 'Idempotency-Key': `e2e-${s}` },
    }),
  );
  return { course, batch, students };
}

test.describe('Sprint 5: attendance and marks → student sees live figures', () => {
  test('trainer marks attendance and records marks; the student sees them', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(90_000);
    const { course, batch, students } = await setup(request);
    const batchLabel = `${course.title} · Evening`;

    // Trainer: today's session → attendance sheet.
    await signIn(page, ACCOUNTS.TRAINER);
    await page.goto('/trainer/sessions');
    await page
      .getByRole('link', { name: new RegExp(`^Take attendance for ${batchLabel}`) })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Attendance');
    await page.getByRole('button', { name: 'Mark all present' }).click();
    await page
      .getByRole('group', { name: `Attendance for ${students[1]!.fullName}` })
      .getByText('Absent')
      .click();
    await expect(page.getByText('Present 1 · Late 0 · Absent 1 · Not marked 0')).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.getByRole('button', { name: 'Save attendance' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Attendance saved' })).toBeVisible();
    await expect(page.getByText(/You can change this attendance until/)).toBeVisible();

    // Trainer: add an assessment and enter marks, with an out-of-range value caught inline.
    await page.goto(`/trainer/assessments?batch=${batch.id}`);
    await page.getByRole('button', { name: 'Add assessment' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill('Practical test 1');
    await dialog.getByLabel('Type').selectOption('PRACTICAL');
    await dialog.getByLabel('Maximum marks').fill('50');
    await dialog.getByLabel('Weightage').fill('1');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Assessment saved' })).toBeVisible();
    await page.getByRole('link', { name: 'Enter marks for Practical test 1' }).click();

    const first = page.getByLabel(`Marks for ${students[0]!.fullName}`, { exact: true });
    await first.fill('55');
    await expect(page.getByText('Enter a number from 0 to 50').first()).toBeVisible();
    await first.fill('45');
    await page.getByLabel(`Marks for ${students[1]!.fullName}`, { exact: true }).fill('20');
    await page.getByLabel(`Remarks for ${students[0]!.fullName}`).fill('Neat joints');
    await expectNoSeriousA11yViolations(page);
    await page.getByRole('button', { name: 'Save marks' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Marks saved' })).toBeVisible();

    // Student: live attendance, result, aggregate (45/50 = 90 %) and projected grade A.
    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await signIn(student, students[0]!.email, students[0]!.password);
    await student.goto('/student/training');
    await expect(student.getByRole('heading', { name: batchLabel })).toBeVisible();
    await expect(student.getByRole('img', { name: 'Attendance 100.00 %' })).toBeVisible();
    await expect(student.getByText('1 of 1 sessions')).toBeVisible();
    await expect(
      student
        .getByRole('table', { name: 'Your assessment results' })
        .getByRole('row', { name: /Practical test 1/ }),
    ).toContainText('45 / 50');
    await expect(student.getByText('90.00 %')).toBeVisible();
    await expect(student.getByText(/Projected grade:\s*A/)).toBeVisible();
    await expectNoSeriousA11yViolations(student);
    await studentContext.close();
  });
});
