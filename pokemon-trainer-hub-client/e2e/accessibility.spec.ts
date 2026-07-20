import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockAuth0Login } from './helpers/auth-mock';
import { mockApi, MOCK_PROFILE } from './helpers/api-mock';

// Automated accessibility scans (axe-core) on top of the existing Playwright
// E2E infra — no new tooling beyond one dependency. Runs against the real
// rendered DOM, same pages already covered by the other E2E specs.

test('Landing page has no automatically-detectable accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // color-contrast used to be excluded here: the shared type-pill badges
  // rendered text in the raw type color on that same color's own tinted
  // background (e.g. Water's blue measured 4.18:1, short of WCAG AA's
  // 4.5:1) — too close in hue/lightness by construction, on every page
  // that renders a type badge. Fixed by giving every .type-pill/.fav-pill
  // a fixed, theme-contrasting text color instead (the type color still
  // shows via the full-saturation glyph dot) — no longer needs excluding.
  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test('Home page (authenticated) has no automatically-detectable accessibility violations', async ({ page }) => {
  await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
  await mockApi(page);

  await page.goto('/');
  await page.getByRole('button', { name: /get started/i }).click();
  await page.waitForURL('**/home');
  await expect(page.getByRole('heading', { name: MOCK_PROFILE.trainerName })).toBeVisible();

  // color-contrast used to be excluded here: the shared type-pill badges
  // rendered text in the raw type color on that same color's own tinted
  // background (e.g. Water's blue measured 4.18:1, short of WCAG AA's
  // 4.5:1) — too close in hue/lightness by construction, on every page
  // that renders a type badge. Fixed by giving every .type-pill/.fav-pill
  // a fixed, theme-contrasting text color instead (the type color still
  // shows via the full-saturation glyph dot) — no longer needs excluding.
  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
