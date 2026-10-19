import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Seeded dev/CI accounts (see README). Never real credentials. */
export const SEED_PASSWORD = process.env.E2E_PASSWORD ?? 'Password@123';
export const ACCOUNTS = {
  ADMIN: 'admin@kiss-vtmp.test',
  TRAINER: 'trainer1@kiss-vtmp.test',
  STUDENT: 'student001@kiss-vtmp.test',
} as const;

export async function signIn(page: Page, email: string, password = SEED_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}
