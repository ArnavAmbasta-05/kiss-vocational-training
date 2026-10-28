import {
  test,
  expect as baseExpect,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import { ACCOUNTS, SEED_PASSWORD, expectNoSeriousA11yViolations, signIn } from './helpers';
import { setupActiveBatch, token } from './world';

const expect = baseExpect.configure({ timeout: 15_000 });

/**
 * Through the API: the first student attends, scores 45/50, is recommended, gets a verified
 * practical competency, and is certified. Returns the certificate code.
 */
async function certifiedStudent(request: APIRequestContext) {
  const world = await setupActiveBatch(request);
  const A = { headers: { Authorization: world.adminAuth } };
  const T = { headers: { Authorization: await token(request, ACCOUNTS.TRAINER, SEED_PASSWORD) } };
  const ok = async <R = Record<string, unknown>>(res: Promise<APIResponse>): Promise<R> => {
    const r = await res;
    expect(r.ok(), `${r.url()} → ${r.status()} ${await r.text()}`).toBeTruthy();
    return (await r.json()) as R;
  };
  const [first, second] = world.students;
  const sessions = await ok<Array<{ id: string }>>(
    request.get(`/api/v1/batches/${world.batch.id}/sessions`, T),
  );
  const sheet = await ok<{ rows: Array<{ studentId: string; fullName: string }> }>(
    request.get(`/api/v1/sessions/${sessions[0]!.id}/attendance`, T),
  );
  const idOf = (name: string) => sheet.rows.find((r) => r.fullName === name)!.studentId;
  await ok(
    request.put(`/api/v1/sessions/${sessions[0]!.id}/attendance`, {
      ...T,
      data: {
        entries: [
          { studentId: idOf(first!.fullName), status: 'PRESENT' },
          { studentId: idOf(second!.fullName), status: 'PRESENT' },
        ],
      },
    }),
  );
  const assessment = await ok<{ id: string }>(
    request.post(`/api/v1/batches/${world.batch.id}/assessments`, {
      ...T,
      data: {
        title: 'Final practical',
        mode: 'PRACTICAL',
        maxMarks: 50,
        weightage: 1,
        isMandatory: true,
      },
    }),
  );
  await ok(
    request.put(`/api/v1/assessments/${assessment.id}/results`, {
      ...T,
      data: { results: [{ studentId: idOf(first!.fullName), marks: 45 }] },
    }),
  );
  await ok(
    request.put(`/api/v1/enrollments/${first!.enrollmentId}/evaluation`, {
      ...T,
      data: { remarks: 'Ready to work', recommended: true },
    }),
  );
  const skill = 'Solder copper joints without leaks';
  const competency = await ok<{ id: string }>(
    request.post(`/api/v1/courses/${world.course.id}/competencies`, {
      ...A,
      data: {
        code: 'SOLDER',
        title: skill,
        mode: 'PRACTICAL',
        requiredLevel: 3,
        isMandatory: true,
      },
    }),
  );
  await ok(
    request.put(`/api/v1/batches/${world.batch.id}/competency-ratings`, {
      ...T,
      data: {
        ratings: [
          { studentId: idOf(first!.fullName), competencyId: competency.id, level: 3, verify: true },
        ],
      },
    }),
  );
  const approved = await ok<{ certificate: { publicCode: string } }>(
    request.post(`/api/v1/completions/${first!.enrollmentId}/approve`, {
      headers: { ...A.headers, 'Idempotency-Key': `e2e-${Date.now()}` },
    }),
  );
  return { student: first!, skill, code: approved.certificate.publicCode };
}

test.describe('Sprint 9: QR verification and the Skill Passport', () => {
  test('anyone verifies a certificate; the student shares a passport and revokes it; the admin revokes the certificate', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(150_000);
    const { student, skill, code } = await certifiedStudent(request);

    // Anyone, without signing in: the QR target shows "Valid" with matching details.
    const publicContext = await browser.newContext();
    const anon = await publicContext.newPage();
    await anon.goto(`/verify/${code}`);
    await expect(anon.getByRole('heading', { name: 'Valid certificate' })).toBeVisible();
    await expect(anon.getByText(student.fullName)).toBeVisible();
    await expectNoSeriousA11yViolations(anon);
    // TC-18: an unknown ID typed into the form.
    await anon.getByLabel('Certificate ID').fill('zzzz-zzzz-zzzz-zzzz');
    await anon.getByRole('button', { name: 'Verify' }).click();
    await expect(anon.getByRole('heading', { name: 'Certificate not found' })).toBeVisible();

    // The student's passport, then a share link.
    await signIn(page, student.email, student.password);
    await page.getByRole('link', { name: 'Skill Passport' }).first().click();
    await expect(page.getByTestId('passport-skills')).toContainText(skill);
    await expectNoSeriousA11yViolations(page);
    await page.getByRole('button', { name: 'Share passport' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Create link' }).click();
    const linkField = page.getByRole('dialog').getByLabel('Your link');
    await expect(linkField).toHaveValue(/\/p\/[A-Za-z0-9_-]{43}$/);
    await expect(
      page.getByRole('dialog').getByRole('img', { name: 'QR code for your passport link' }),
    ).toBeVisible();
    const link = new URL(await linkField.inputValue());
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();

    // Opened without signing in: name and verified skills, nothing else.
    await anon.goto(link.pathname);
    await expect(anon.getByRole('heading', { level: 1, name: student.fullName })).toBeVisible();
    await expect(anon.getByText(skill)).toBeVisible();
    await expectNoSeriousA11yViolations(anon);

    // Revoked → "Link no longer active" (BRD acceptance).
    await page.getByRole('button', { name: /^Revoke the link created/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Link revoked' })).toBeVisible();
    await anon.reload();
    await expect(anon.getByRole('heading', { name: 'Link no longer active' })).toBeVisible();

    // Admin revokes the certificate; verification then says "Revoked".
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signIn(admin, ACCOUNTS.ADMIN);
    await admin.goto('/admin/certificates');
    await admin.getByLabel('Search by name, roll number or certificate ID').fill(code);
    await admin.getByRole('button', { name: `Revoke certificate ${code}` }).click();
    await admin
      .getByRole('dialog')
      .getByLabel(/^Reason/)
      .fill('Issued against the wrong batch');
    await admin.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(
      admin.getByRole('status').filter({ hasText: 'Certificate revoked' }),
    ).toBeVisible();

    // A revoked certificate can be replaced: reissue gives a new valid code (BR-19).
    await admin.getByRole('button', { name: `Reissue certificate ${code}` }).click();
    await expect(admin.getByRole('dialog')).toContainText(
      'The revoked ID keeps showing as revoked',
    );
    await admin.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(
      admin.getByRole('status').filter({ hasText: /New certificate [A-Z0-9]+ issued/ }),
    ).toBeVisible();
    await expect(admin.getByRole('button', { name: `Reissue certificate ${code}` })).toHaveCount(0);
    await adminContext.close();

    await anon.goto(`/verify/${code}`);
    await expect(anon.getByRole('heading', { name: 'Revoked' })).toBeVisible();
    await expect(anon.getByText('wrong batch')).toHaveCount(0);
    await publicContext.close();
  });
});
