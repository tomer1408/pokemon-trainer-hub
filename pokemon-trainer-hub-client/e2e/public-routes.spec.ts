import { test, expect } from '@playwright/test';

// Everything in this file runs against the real app with NO mocking — real
// Angular routing, the real Auth0 tenant, the real authGuardFn. It only
// covers what's reachable without a logged-in session; see e2e/README.md
// for why authenticated flows aren't covered here yet.

test('Landing page renders the real headline and CTA', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Pokemon Trainer Hub')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Dream Team');
  await expect(page.getByRole('button', { name: /Get Started/i })).toBeVisible();
});

test('Clicking Get Started starts a real Auth0 login redirect', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Get Started/i }).click();

  // Don't try to complete the real Auth0 hosted login (needs real
  // credentials) — just prove the app actually kicks off a real redirect to
  // the real tenant, i.e. the login button and Auth0 wiring genuinely work.
  await page.waitForURL(/dev-4sn27sue6rmxl7hd\.us\.auth0\.com/, { timeout: 15_000 });
});

test('Visiting a protected route while logged out redirects to real Auth0 login, not the app', async ({ page }) => {
  await page.goto('/home');

  await page.waitForURL(/dev-4sn27sue6rmxl7hd\.us\.auth0\.com/, { timeout: 15_000 });
});

test('An unknown URL shows the real Not Found page without requiring login', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');

  // Per app.routes.ts: the wildcard route is deliberately NOT auth-guarded,
  // so a mistyped URL must never bounce a logged-out visitor to Auth0.
  await expect(page).toHaveURL(/\/this-page-does-not-exist$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Wild Page Appeared');
});
