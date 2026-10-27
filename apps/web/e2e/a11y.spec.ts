import { test, expect as baseExpect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { NAV_BY_ROLE } from '../src/components/layout/nav';
import { ACCOUNTS, SEED_PASSWORD, signIn } from './helpers';
import { setupActiveBatch } from './world';

const expect = baseExpect.configure({ timeout: 15_000 });

/** Serious and critical WCAG 2 A/AA violations on the current page, as short lines. */
async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return results.violations
    .filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
    .map((v) => `${new URL(page.url()).pathname}: ${v.id} (${v.nodes.length}) ${v.help}`);
}

/** Waits until the page has its heading and nothing is still loading. */
async function settled(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main h1').first()).toBeVisible();
}

test.describe('NFR-12, BRQ-16.4: every main page passes axe (WCAG 2.1 AA, no serious issues)', () => {
  test('public pages', async ({ page }) => {
    const found: string[] = [];
    for (const path of ['/login', '/this-page-does-not-exist']) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      found.push(...(await violations(page)));
    }
    // The standalone verify page (no React) for a valid-looking but unknown code.
    await page.goto('/verify/ZZZZZZZZZZZZZZZZ');
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    found.push(...(await violations(page)));
    expect(found).toEqual([]);
  });

  for (const role of ['STUDENT', 'TRAINER', 'ADMIN'] as const) {
    test(`every ${role.toLowerCase()} page in the sidebar`, async ({ page }) => {
      test.setTimeout(120_000);
      await signIn(page, ACCOUNTS[role]);
      const found: string[] = [];
      for (const item of NAV_BY_ROLE[role]) {
        await page.goto(item.to);
        await settled(page);
        found.push(...(await violations(page)));
      }
      expect(found).toEqual([]);
    });
  }
});

/** Presses Tab until `target` has focus (it must be reachable without a mouse). */
async function tabTo(page: Page, target: Locator, max = 400) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`Not reachable with Tab: ${target.toString()}`);
}

test.describe('NFR-12, BRQ-16.4: the core trainer workflow works with the keyboard alone', () => {
  test('sign in, open the session, mark attendance and save, without the mouse', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const { course, students } = await setupActiveBatch(request);
    const batchLabel = `${course.title} · Evening`;

    await page.goto('/login');
    await tabTo(page, page.getByLabel('Email'));
    await page.keyboard.type(ACCOUNTS.TRAINER);
    await tabTo(page, page.getByLabel('Password'));
    await page.keyboard.type(SEED_PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));

    // Skip link first, then the sidebar link to Sessions (on a phone, behind the menu button).
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    const menu = page.getByRole('button', { name: 'Open menu' });
    if (await menu.isVisible()) {
      await tabTo(page, menu);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    }
    await tabTo(
      page,
      page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: 'Sessions', exact: true }),
    );
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/trainer\/sessions/);

    const take = page.getByRole('link', { name: new RegExp(`^Take attendance for ${batchLabel}`) });
    await expect(take).toBeVisible();
    await tabTo(page, take);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Attendance');

    await tabTo(page, page.getByRole('button', { name: 'Mark all present' }));
    await page.keyboard.press('Enter');
    // Within one student's radio group the arrow keys choose: Present → Late → Absent.
    const group = page.getByRole('group', { name: `Attendance for ${students[1]!.fullName}` });
    await tabTo(page, group.getByRole('radio', { checked: true }));
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(group.getByRole('radio', { name: 'Absent' })).toBeChecked();
    await expect(page.getByText('Present 1 · Late 0 · Absent 1 · Not marked 0')).toBeVisible();

    await tabTo(page, page.getByRole('button', { name: 'Save attendance' }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Attendance saved' })).toBeVisible();
    // Focus stays visible on whatever control has it (WCAG 2.4.7).
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return 'body';
      const s = getComputedStyle(el);
      return `${s.outlineStyle} ${s.boxShadow}`;
    });
    expect(outline).not.toBe('none none');
  });
});

test.describe('NFR-12: layouts hold at 360 px (small phones)', () => {
  for (const role of ['STUDENT', 'TRAINER', 'ADMIN'] as const) {
    test(`no ${role.toLowerCase()} page scrolls sideways`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 360, height: 740 });
      await signIn(page, ACCOUNTS[role]);
      const wide: string[] = [];
      for (const item of NAV_BY_ROLE[role]) {
        await page.goto(item.to);
        await settled(page);
        // Wide tables scroll inside their own region; the page itself must not.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 1) wide.push(`${item.to}: ${overflow}px too wide`);
      }
      expect(wide).toEqual([]);
    });
  }
});
