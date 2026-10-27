import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ACCOUNTS, expectNoSeriousA11yViolations, signIn } from './helpers';

test.describe('app shell smoke', () => {
  test('signed-out visitors land on the login page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
    await expectNoSeriousA11yViolations(page);
  });

  test('skip link moves focus to the main content', async ({ page }) => {
    await signIn(page, ACCOUNTS.STUDENT);
    await expect(page).toHaveURL('/student');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('the shell keeps focus while a page waits for its translations', async ({ page }) => {
    // Page namespaces load with the page. If the shell (header, menus) needs one that isn't
    // fetched at start-up, the whole shell is swapped for a spinner on a slow connection and
    // focus is lost. Every namespace except the always-needed two is slowed down here.
    const locales = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'locales', 'en');
    const later = readdirSync(locales)
      .map((f) => f.replace('.json', ''))
      .filter((ns) => !['common', 'errors'].includes(ns));
    const names = later.join('|');
    const lazy = new RegExp(String.raw`(locales/en/(${names})\.json|assets/(${names})-[\w-]+\.js)`);
    await page.route(lazy, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });
    await signIn(page, ACCOUNTS.STUDENT);
    await expect(page).toHaveURL('/student');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('unknown routes show the 404 page', async ({ page }) => {
    await signIn(page, ACCOUNTS.STUDENT);
    await expect(page).toHaveURL('/student');
    await page.goto('/this/does/not/exist');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await page.getByRole('link', { name: 'Go to the home page' }).click();
    await expect(page).toHaveURL('/student');
  });

  test('language switcher changes and remembers the locale', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('language-switcher').selectOption('or');
    await expect(page.locator('html')).toHaveAttribute('lang', 'or');
    // Untranslated strings fall back to English rather than going blank.
    await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'or');
  });
});
