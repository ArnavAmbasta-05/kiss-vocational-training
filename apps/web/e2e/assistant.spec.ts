import { test, expect as baseExpect } from '@playwright/test';
import { ACCOUNTS, expectNoSeriousA11yViolations, signIn } from './helpers';
import { setupActiveBatch } from './world';

const expect = baseExpect.configure({ timeout: 15_000 });

/** A one-page PDF with a real text layer (built by hand: e2e has no PDF library). */
function pdfWithText(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = `BT /F1 12 Tf 72 720 Td 16 TL ${lines.map((l) => `(${esc(l)}) '`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test.describe('F17: AI training assistant (mock providers)', () => {
  test('the admin approves a PDF; the student gets a cited answer and practice questions', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const world = await setupActiveBatch(request);
    const student = world.students[0]!;
    const title = `Welding safety ${Date.now().toString(36)}`;

    // Admin: upload a PDF for the batch's course and approve it.
    await signIn(page, ACCOUNTS.ADMIN);
    await page.goto('/admin/materials');
    await expect(page.getByRole('heading', { name: 'Assistant materials' })).toBeVisible();
    await page.getByLabel('Course').selectOption(world.course.id);
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('File').setInputFiles({
      name: 'welding.pdf',
      mimeType: 'application/pdf',
      buffer: pdfWithText([
        'Always wear a welding helmet with a shade 10 filter lens.',
        'Wear leather gloves and a flame resistant jacket when welding.',
        'Keep the welding booth clear of paper and oil.',
      ]),
    });
    await page.getByRole('button', { name: 'Upload for review' }).click();
    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row.getByText('Waiting for review')).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(row.getByText('Approved', { exact: true })).toBeVisible();

    // Student: ask a question, see the cited answer and its source.
    const context = await browser.newContext();
    const sp = await context.newPage();
    await signIn(sp, student.email, student.password);
    await sp.goto('/student/assistant');
    await expect(sp.getByRole('heading', { name: 'Training assistant' })).toBeVisible();
    await sp.getByLabel('Your question').fill('Which welding helmet filter lens should I wear?');
    await sp.getByRole('button', { name: 'Ask' }).click();
    const answer = sp.getByRole('article').first();
    await expect(answer).toContainText('shade 10 filter lens');
    await expect(answer.getByRole('link', { name: 'Source 1' })).toBeVisible();
    await expect(answer.getByTestId('sources')).toContainText(title);

    // Practice mode: one multiple-choice question that can be checked.
    await sp.locator('form').getByText('Practice questions', { exact: true }).click();
    await sp.getByLabel('Your question').fill('Test me on welding helmet filter lens safety');
    await sp.getByRole('button', { name: 'Ask' }).click();
    const practice = sp.getByRole('article').first();
    await practice.getByRole('radio').first().check();
    await practice.getByRole('button', { name: 'Check answer' }).click();
    await expect(practice.getByRole('status')).toContainText('Correct!');

    // Something the materials do not cover is declined without an answer.
    await sp.locator('form').getByText('Answer my question', { exact: true }).click();
    await sp.getByLabel('Your question').fill('Who won the cricket match yesterday?');
    await sp.getByRole('button', { name: 'Ask' }).click();
    await expect(sp.getByRole('article').first()).toContainText(
      'I could not find this in your course materials',
    );
    await expectNoSeriousA11yViolations(sp);
    await context.close();
  });
});
