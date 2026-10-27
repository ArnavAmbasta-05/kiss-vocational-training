import { test, expect as baseExpect } from '@playwright/test';
import { ACCOUNTS, signIn } from './helpers';
import { setupActiveBatch, token } from './world';

const expect = baseExpect.configure({ timeout: 15_000 });

test.describe('Sprint 13: stored text never runs as code', () => {
  test('a name containing HTML and script shows as plain text to the admin', async ({
    page,
    request,
  }) => {
    const world = await setupActiveBatch(request);
    const student = world.students[0]!;
    const payload = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>`;
    const name = `Trainee ${payload}`;
    const auth = await token(request, student.email, student.password);
    const res = await request.patch('/api/v1/users/me', {
      headers: { Authorization: auth },
      data: { fullName: name },
    });
    expect(res.ok()).toBeTruthy();

    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await signIn(page, ACCOUNTS.ADMIN);
    await page.goto('/admin/users');
    await page
      .getByLabel('Search by name, email, roll number or employee code')
      .fill(student.email);
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(dialogs).toEqual([]);
  });
});
