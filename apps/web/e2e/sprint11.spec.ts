import { test, expect as baseExpect, type APIResponse } from '@playwright/test';
import { ACCOUNTS, SEED_PASSWORD, expectNoSeriousA11yViolations, signIn } from './helpers';
import { setupActiveBatch, token } from './world';

const expect = baseExpect.configure({ timeout: 15_000 });

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
/** Tomorrow's date at the institution (IST). */
const tomorrowIst = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(Date.now() + 86_400_000);

test.describe('Sprint 11: scheduling advisor, practical evidence, career matcher', () => {
  test('a clashing session is refused with free times; the trainer adds evidence; the student matches an opportunity', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const world = await setupActiveBatch(request);
    const A = { headers: { Authorization: world.adminAuth } };
    const T = { headers: { Authorization: await token(request, ACCOUNTS.TRAINER, SEED_PASSWORD) } };
    const ok = async <R = Record<string, unknown>>(res: Promise<APIResponse>): Promise<R> => {
      const r = await res;
      expect(r.ok(), `${r.url()} → ${r.status()} ${await r.text()}`).toBeTruthy();
      return (await r.json()) as R;
    };
    const s = Date.now().toString(36).toUpperCase();
    const student = world.students[0]!;

    // Setup through the API: a session tomorrow 10:00–12:00 IST at the batch's venue, a
    // practical assessment with marks, and a verified practical competency.
    const day = tomorrowIst();
    await ok(
      request.post(`/api/v1/admin/batches/${world.batch.id}/sessions`, {
        ...A,
        data: {
          kind: 'single',
          startsAt: `${day}T10:00:00+05:30`,
          endsAt: `${day}T12:00:00+05:30`,
        },
      }),
    );
    const assessment = await ok<{ id: string; title: string }>(
      request.post(`/api/v1/batches/${world.batch.id}/assessments`, {
        ...T,
        data: {
          title: `Pipe joint ${s}`,
          mode: 'PRACTICAL',
          maxMarks: 50,
          weightage: 1,
          isMandatory: true,
        },
      }),
    );
    const sheet = await ok<{ rows: Array<{ studentId: string; fullName: string }> }>(
      request.get(`/api/v1/assessments/${assessment.id}/results`, T),
    );
    const studentId = sheet.rows.find((r) => r.fullName === student.fullName)!.studentId;
    await ok(
      request.put(`/api/v1/assessments/${assessment.id}/results`, {
        ...T,
        data: { results: [{ studentId, marks: 44 }] },
      }),
    );
    const competency = await ok<{ id: string }>(
      request.post(`/api/v1/courses/${world.course.id}/competencies`, {
        ...A,
        data: {
          code: `PIPE${s}`.slice(0, 20),
          title: `Join copper pipes ${s}`,
          mode: 'PRACTICAL',
          requiredLevel: 3,
          isMandatory: false,
        },
      }),
    );
    await ok(
      request.put(`/api/v1/batches/${world.batch.id}/competency-ratings`, {
        ...T,
        data: { ratings: [{ studentId, competencyId: competency.id, level: 3, verify: true }] },
      }),
    );

    // F14: the admin tries to book the same venue 11:00–13:00 tomorrow → refused, with free times.
    await signIn(page, ACCOUNTS.ADMIN);
    await page.goto(`/admin/batches/${world.batch.id}`);
    await page.getByRole('tab', { name: 'Sessions' }).click();
    await page.getByRole('button', { name: 'Schedule sessions' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('One session').check();
    await dialog.getByLabel('Date').fill(day);
    await dialog.getByLabel('Start time').fill('11:00');
    await dialog.getByLabel('End time').fill('13:00');
    await dialog.getByRole('button', { name: 'Save' }).click();
    const alert = dialog.getByRole('alert');
    await expect(alert).toContainText('clashes with another session');
    await expect(alert).toContainText('Free times nearby');
    await alert.getByRole('button').first().click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: /session.* scheduled/ })).toBeVisible();

    // F13 setup by the admin (API): a role needing the verified competency, and an opportunity.
    const role = await ok<{ id: string }>(
      request.post('/api/v1/job-roles', {
        ...A,
        data: {
          title: `Plumber helper ${s}`,
          competencies: [{ code: `PIPE${s}`.slice(0, 20), level: 3 }],
        },
      }),
    );
    const opportunityTitle = `Plumbing apprentice ${s}`;
    await ok(
      request.post('/api/v1/opportunities', {
        ...A,
        data: {
          roleId: role.id,
          title: opportunityTitle,
          type: 'APPRENTICESHIP',
          partner: 'Demo Plumbing Co',
          closesOn: tomorrowIst(),
        },
      }),
    );

    // F18: the trainer creates a rubric and attaches a photo with scores and its competency.
    const trainerContext = await browser.newContext();
    const tp = await trainerContext.newPage();
    await signIn(tp, ACCOUNTS.TRAINER);
    await tp.goto(`/trainer/assessments?batch=${world.batch.id}`);
    await tp.getByRole('link', { name: `Evidence for ${assessment.title}` }).click();
    await tp.getByRole('button', { name: 'Create rubric' }).click();
    await tp.getByRole('button', { name: 'Save rubric' }).click();
    await expect(tp.getByRole('status').filter({ hasText: 'Rubric saved' })).toBeVisible();
    await tp.getByRole('button', { name: `Add evidence for ${student.fullName}` }).click();
    const add = tp.getByRole('dialog');
    await add.locator('input[type="file"]').setInputFiles({
      name: 'joint.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(add.getByText('joint.png')).toBeVisible();
    await add.getByLabel('Works safely').selectOption('3');
    await add.getByRole('button', { name: 'Save' }).click();
    await expect(tp.getByRole('status').filter({ hasText: 'Evidence added' })).toBeVisible();
    await expect(tp.getByTestId('evidence-rows')).toContainText('joint.png');
    await expect(tp.getByTestId('evidence-rows')).toContainText('Works safely: Proficient');
    await expectNoSeriousA11yViolations(tp);
    await trainerContext.close();

    // The student: the evidence shows in the passport; the opportunity is a 100 % match.
    const studentContext = await browser.newContext();
    const sp = await studentContext.newPage();
    await signIn(sp, student.email, student.password);
    await sp.goto('/student/passport');
    await expect(sp.getByTestId('passport-skills')).toContainText('joint.png');
    await sp.goto('/student/opportunities');
    const card = sp.getByRole('listitem').filter({ hasText: opportunityTitle });
    await expect(card.getByRole('img', { name: '100 % match' })).toBeVisible();
    await card.getByRole('button', { name: "I'm interested" }).click();
    await expect(card.getByRole('button', { name: /Interested/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectNoSeriousA11yViolations(sp);
    await studentContext.close();

    // The admin sees the interested student with their match.
    await page.goto('/admin/opportunities');
    await page.getByLabel('Status').selectOption('OPEN');
    await page.getByRole('button', { name: `Interested students for ${opportunityTitle}` }).click();
    await expect(page.getByRole('dialog')).toContainText(student.fullName);
    await expect(page.getByRole('dialog')).toContainText('100 % match');
    await expectNoSeriousA11yViolations(page);
  });
});
