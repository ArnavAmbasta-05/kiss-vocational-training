import { test, expect as baseExpect } from '@playwright/test';
import { ACCOUNTS, expectNoSeriousA11yViolations, signIn } from './helpers';
import { setupActiveBatch } from './world';

const expect = baseExpect.configure({ timeout: 15_000 });

/**
 * BRD §9.4 acceptance, through the UI: the admin defines a level-3 competency and a resource,
 * the trainer rates a student at level 1, and the student sees a gap of 2 with the resource
 * recommended; the heatmap highlights the cell.
 */
test.describe('Sprint 8: competency model and Gap Analyzer', () => {
  test('admin defines, trainer rates, student sees the gap and what to practise', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const { course, batch, students } = await setupActiveBatch(request);
    const student = students[0]!;
    const code = `PIPE-${Date.now().toString(36).slice(-4)}`.toUpperCase();

    // Admin: competency (required level 3, mandatory by default) and a curated resource.
    await signIn(page, ACCOUNTS.ADMIN);
    await page.goto(`/admin/competencies?course=${course.id}`);
    await page.getByRole('button', { name: 'Add competency' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Code').fill(code);
    await form
      .getByLabel('Title', { exact: true })
      .fill('Join copper pipes with compression fittings');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Competency saved' })).toBeVisible();
    await expect(
      page
        .getByRole('table', { name: 'Competencies of this course' })
        .getByRole('row', { name: new RegExp(code) }),
    ).toContainText('3 Independent');

    await page.getByRole('button', { name: 'Add resource' }).click();
    const res = page.getByRole('dialog');
    await res
      .getByLabel('Competency')
      .selectOption({ label: `${code} · Join copper pipes with compression fittings` });
    await res.getByLabel('Title').fill('Compression fittings explained');
    await res.getByLabel('Type').selectOption('DOCUMENT');
    await res.getByLabel('Link').fill('https://en.wikipedia.org/wiki/Compression_fitting');
    await res.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Resource saved' })).toBeVisible();
    await expect(
      page
        .getByRole('table', { name: 'Learning resources' })
        .getByRole('row', { name: /Compression fittings explained/ }),
    ).toContainText('Approved');
    await expectNoSeriousA11yViolations(page);

    // Trainer: rates the student at level 1; verify isn't offered below the required level.
    const trainerContext = await browser.newContext();
    const tp = await trainerContext.newPage();
    await signIn(tp, ACCOUNTS.TRAINER);
    await tp.goto(`/trainer/competencies?batch=${batch.id}`);
    await tp.getByLabel(`Level for ${student.fullName} on ${code}`).selectOption('1');
    await expect(tp.getByLabel(`Verify ${code} for ${student.fullName}`)).toHaveCount(0);
    await tp.getByRole('button', { name: 'Save ratings' }).click();
    await expect(tp.getByRole('status').filter({ hasText: '1 rating saved' })).toBeVisible();
    await expectNoSeriousA11yViolations(tp);

    await tp.getByRole('tab', { name: 'Heatmap' }).click();
    const heat = tp.getByRole('table', { name: 'Competency heatmap' });
    await expect(heat.getByRole('row', { name: new RegExp(student.fullName) })).toContainText(
      'L1 · gap 2',
    );
    await expect(heat).toContainText('1 student below level');
    await expectNoSeriousA11yViolations(tp);
    await trainerContext.close();

    // Student: gap of 2 with the resource recommended (BRD acceptance).
    const studentContext = await browser.newContext();
    const sp = await studentContext.newPage();
    await signIn(sp, student.email, student.password);
    await sp.getByRole('link', { name: 'My skill gaps' }).first().click();
    const gap = sp.getByTestId(`gap-${code}`);
    await expect(gap).toContainText('Gap: 2 levels');
    await expect(gap).toContainText('Yours: level 1');
    await expect(gap.getByRole('link', { name: 'Compression fittings explained' })).toHaveAttribute(
      'href',
      'https://en.wikipedia.org/wiki/Compression_fitting',
    );
    await expectNoSeriousA11yViolations(sp);
    await studentContext.close();
  });
});
