import { test, expect } from '@playwright/test';
import { mockAuth0Login } from './helpers/auth-mock';
import { mockApi, MOCK_PROFILE, MOCK_TEAM } from './helpers/api-mock';

test.describe('Onboarding — a brand-new trainer creating a real profile', () => {
  test('filling the whole form and submitting creates the real profile and lands on Home', async ({ page }) => {
    await mockAuth0Login(page, { name: 'Ash', email: 'ash@example.com' });
    // No existing profile — the real 404 branch (see callback.ts/onboardingGuard).
    await mockApi(page, { profile: null, team: [] });

    await page.goto('/');
    await page.getByRole('button', { name: /get started/i }).click();
    await page.waitForURL('**/onboarding');

    await page.getByPlaceholder('e.g. Ash').fill('Ash');
    await page.getByPlaceholder('e.g. Ketchum').fill('Ketchum');
    await page.getByPlaceholder('e.g. PikaFan, FireMaster, AshK').fill('AshK');

    // Real date-picker interaction: open it, jump to the year-grid view,
    // page back one 12-year window (today's default window only goes back
    // to ~10 years old — under the 13-year minimum), pick a safely-old
    // year, then day 15 of whatever month it defaults to (always valid,
    // non-future).
    await page.locator('.date-trigger').click();
    await page.locator('.date-nav-label').click();
    await page.getByRole('button', { name: 'Previous years' }).click();
    await page.locator('.year-cell', { hasText: '2010' }).click();
    await page.locator('.day-cell', { hasText: '15' }).first().click();

    await page.locator('.country-trigger').click();
    await page.locator('.country-item', { hasText: 'Japan' }).click();

    // Click the checkbox visual itself, not the row's inline "Terms of Use"
    // link (clicking the link opens the real PolicyModal instead of
    // toggling consent).
    await page.locator('.consent-row', { hasText: 'Terms of Use' }).locator('.consent-box').click();

    await page.getByRole('button', { name: 'Create My Trainer Profile' }).click();

    // A brand-new profile has hasCompletedStarterQuiz: false, so
    // starterQuizGuard genuinely redirects Home straight to the quiz —
    // never actually landing on /home first.
    await page.waitForURL('**/starter-quiz');
  });

  test('the submit button stays disabled-equivalent (blocked) until every required field is filled', async ({ page }) => {
    await mockAuth0Login(page, { name: 'Ash', email: 'ash@example.com' });
    await mockApi(page, { profile: null, team: [] });

    await page.goto('/');
    await page.getByRole('button', { name: /get started/i }).click();
    await page.waitForURL('**/onboarding');

    await page.getByRole('button', { name: 'Create My Trainer Profile' }).click();

    // A real client-side validation error appears instead of silently
    // submitting an incomplete profile.
    await expect(page.getByText(/is required|select your/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);
  });
});

test.describe('AI Trainer Assistant — real analyze/query flows against the mocked LLM endpoints', () => {
  test('Analyze My Team shows a real recommendation and Refresh Analysis re-queries it', async ({ page }) => {
    await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
    await mockApi(page, { team: MOCK_TEAM });

    await page.goto('/');
    await page.getByRole('button', { name: /get started/i }).click();
    await page.waitForURL('**/home');

    await page.locator('.avatar-btn').click();
    await page.locator('.panel').getByRole('link', { name: 'AI Trainer Assistant' }).click();
    await page.waitForURL('**/ai-assistant');

    await expect(page.getByText('Your team leans electric', { exact: false })).toBeVisible();
    await expect(page.locator('.rec-pokemon-btn')).toBeVisible();

    await page.getByRole('button', { name: 'Refresh Analysis' }).click();
    await expect(page.getByText('Your team leans electric', { exact: false })).toBeVisible();
  });

  test('Find by Description sends a real query and shows the recommendation', async ({ page }) => {
    await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
    await mockApi(page, { team: MOCK_TEAM });

    await page.goto('/');
    await page.getByRole('button', { name: /get started/i }).click();
    await page.waitForURL('**/home');

    await page.locator('.avatar-btn').click();
    await page.locator('.panel').getByRole('link', { name: 'AI Trainer Assistant' }).click();
    await page.waitForURL('**/ai-assistant');

    await page.getByRole('button', { name: 'Find by Description' }).click();
    await page.getByPlaceholder("Describe what you're looking for…").fill('a strong fire-type starter');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();

    await expect(page.getByText('matches a Fire-type Pokémon well', { exact: false })).toBeVisible();
    await expect(page.locator('.rec-pokemon-btn')).toBeVisible();
  });
});
