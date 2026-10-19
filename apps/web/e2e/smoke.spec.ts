import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('app shell smoke', () => {
  test('home renders the shell with a working skip link', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Welcome to the training portal',
    );
    await expect(page.getByRole('banner')).toContainText('KISS VTMP');

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('unknown routes show the 404 page', async ({ page }) => {
    await page.goto('/this/does/not/exist');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await page.getByRole('link', { name: 'Go to the home page' }).click();
    await expect(page).toHaveURL('/');
  });

  test('language switcher changes and remembers the locale', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('language-switcher').selectOption('or');
    await expect(page.locator('html')).toHaveAttribute('lang', 'or');
    // Untranslated strings fall back to English rather than going blank.
    await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'or');
  });

  test('home has no serious accessibility violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('api-status')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
