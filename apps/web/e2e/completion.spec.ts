import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { ACCOUNTS, SEED_PASSWORD, expectNoSeriousA11yViolations, signIn } from './helpers';
import { setupActiveBatch, token } from './world';

/**
 * On top of the active batch: the trainer marks the session (first student present, second
 * absent), records a mandatory practical (45/50 and 15/50) and evaluates (recommended / not).
 */
async function trainTheBatch(request: APIRequestContext) {
  const world = await setupActiveBatch(request);
  const trainer = {
    headers: { Authorization: await token(request, ACCOUNTS.TRAINER, SEED_PASSWORD) },
  };
  const ok = async (res: Promise<APIResponse>) => {
    const r = await res;
    expect(r.ok(), `${r.url()} → ${r.status()} ${await r.text()}`).toBeTruthy();
    return r.json();
  };
  const [first, second] = world.students;

  const sessions = (await ok(
    request.get(`/api/v1/batches/${world.batch.id}/sessions`, trainer),
  )) as Array<{ id: string }>;
  const sheet = (await ok(
    request.get(`/api/v1/sessions/${sessions[0]!.id}/attendance`, trainer),
  )) as { rows: Array<{ studentId: string; fullName: string }> };
  const idOf = (name: string) => sheet.rows.find((r) => r.fullName === name)!.studentId;
  await ok(
    request.put(`/api/v1/sessions/${sessions[0]!.id}/attendance`, {
      ...trainer,
      data: {
        entries: [
          { studentId: idOf(first!.fullName), status: 'PRESENT' },
          { studentId: idOf(second!.fullName), status: 'ABSENT' },
        ],
      },
    }),
  );
  const assessment = (await ok(
    request.post(`/api/v1/batches/${world.batch.id}/assessments`, {
      ...trainer,
      data: {
        title: 'Final practical',
        mode: 'PRACTICAL',
        maxMarks: 50,
        weightage: 1,
        isMandatory: true,
      },
    }),
  )) as { id: string };
  await ok(
    request.put(`/api/v1/assessments/${assessment.id}/results`, {
      ...trainer,
      data: {
        results: [
          { studentId: idOf(first!.fullName), marks: 45 },
          { studentId: idOf(second!.fullName), marks: 15 },
        ],
      },
    }),
  );
  for (const [s, recommended] of [
    [first!, true],
    [second!, false],
  ] as const) {
    await ok(
      request.put(`/api/v1/enrollments/${s.enrollmentId}/evaluation`, {
        ...trainer,
        data: { remarks: recommended ? 'Ready to work' : 'Needs more practice', recommended },
      }),
    );
  }
  return world;
}

test.describe('Sprint 6: approve → certificate PDF', () => {
  test('admin approves an eligible student and closes an ineligible one; the student downloads the certificate', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const { batch, students } = await trainTheBatch(request);
    const [first, second] = students;

    // Admin: completion queue with the BR-09 checklist.
    await signIn(page, ACCOUNTS.ADMIN);
    await page.goto(`/admin/completions?batch=${batch.id}`);
    const queue = page.getByRole('table', { name: 'Completion queue' });
    const firstRow = queue.getByRole('row', { name: new RegExp(first!.fullName) });
    const secondRow = queue.getByRole('row', { name: new RegExp(second!.fullName) });
    await expect(firstRow).toContainText('Attendance 100.00 % (minimum 75 %)');
    await expect(firstRow).toContainText('Aggregate 90.00 % (minimum 40 %)');
    await expect(secondRow).toContainText('Attendance 0.00 % (minimum 75 %)');
    await expect(secondRow).toContainText('Trainer recommendation: no');
    await expect(
      secondRow.getByRole('button', { name: `Approve completion for ${second!.fullName}` }),
    ).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    await page.getByRole('button', { name: `Approve completion for ${first!.fullName}` }).click();
    await expect(
      page.getByRole('status').filter({ hasText: `${first!.fullName} completed: certificate` }),
    ).toBeVisible();
    await expect(firstRow).toContainText('Certified');

    await page.getByRole('button', { name: `Mark ${second!.fullName} as not completed` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Reason')).toHaveValue(/Attendance below the minimum/);
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: `${second!.fullName} marked as not completed` }),
    ).toBeVisible();

    // Admin: the register lists the certificate.
    await page.goto('/admin/certificates');
    await page.getByLabel('Search by name, roll number or certificate ID').fill(first!.fullName);
    await expect(
      page
        .getByRole('table', { name: 'Certificates issued' })
        .getByRole('row', { name: new RegExp(first!.fullName) }),
    ).toContainText('Valid');
    await expectNoSeriousA11yViolations(page);

    // Student: certificate card on the dashboard, PDF download.
    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await signIn(student, first!.email, first!.password);
    const card = student.getByTestId('certificate-card');
    await expect(card).toContainText('Grade A');
    await expect(card).toContainText('Aggregate 90.00 % · Attendance 100.00 %');
    await expectNoSeriousA11yViolations(student);
    const [download] = await Promise.all([
      student.waitForEvent('download'),
      card.getByRole('button', { name: 'Download PDF' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^certificate-[0-9A-HJKMNP-TV-Z]{16}\.pdf$/);
    await studentContext.close();

    // The other student sees why training was not completed.
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await signIn(other, second!.email, second!.password);
    await other.goto('/student/certificates');
    await expect(
      other.getByRole('status').filter({ hasText: 'Training not completed' }),
    ).toContainText('Attendance below the minimum');
    await otherContext.close();
  });
});
