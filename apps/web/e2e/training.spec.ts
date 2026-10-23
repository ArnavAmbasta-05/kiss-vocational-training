import { test, expect } from '@playwright/test';
import { ACCOUNTS, expectNoSeriousA11yViolations, signIn } from './helpers';
import { setupActiveBatch } from './world';

test.describe('Sprint 5: attendance and marks → student sees live figures', () => {
  test('trainer marks attendance and records marks; the student sees them', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(90_000);
    const { course, batch, students } = await setupActiveBatch(request);
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
