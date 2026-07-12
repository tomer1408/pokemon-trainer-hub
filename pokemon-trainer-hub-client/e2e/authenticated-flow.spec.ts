import { test, expect } from '@playwright/test';
import { mockAuth0Login } from './helpers/auth-mock';
import { mockApi, MOCK_PROFILE, MOCK_TEAM } from './helpers/api-mock';

// Drives a full login → Home → My Team flow with Auth0 and the backend API
// both mocked at the network level (see e2e/README.md, Option 2). Nothing
// here touches the real Auth0 tenant or the real database — but the real
// Angular app, real routing/guards, and real rendering logic all run
// unmodified, so this proves the authenticated pages genuinely render the
// data an authenticated session would receive, not just that the mocks work.

test.describe('authenticated flow (mocked Auth0 + API)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
    await mockApi(page);
  });

  test('logging in lands on Home with the real trainer name and team power', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /get started/i }).click();

    await page.waitForURL('**/home');
    await expect(page.getByText('Welcome back, trainer')).toBeVisible();
    await expect(page.getByRole('heading', { name: MOCK_PROFILE.trainerName })).toBeVisible();
    await expect(page.getByText('Team Power')).toBeVisible();
  });

  test('My Team renders Battle Readiness and Matchup Analysis computed from the mocked team', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /get started/i }).click();
    await page.waitForURL('**/home');

    // A real in-app SPA navigation, not page.goto() — the Auth0 SDK is
    // configured memory-only (no localStorage cache) in this app, so a full
    // page reload would drop the session and bounce through silent-auth,
    // which isn't mocked here. Clicking the real navbar link keeps it a
    // client-side route change, exactly like a real logged-in user browsing.
    await page.getByRole('link', { name: 'My Team', exact: true }).click();
    await page.waitForURL('**/my-team');

    await expect(page.getByText('Battle Readiness')).toBeVisible();
    await expect(page.getByText('Matchup Analysis')).toBeVisible();
    await expect(page.getByText('Squad Milestones')).toBeVisible();

    // MOCK_TYPE_CHART's electric entry has `strong: ['water', 'flying']`, so
    // the single-Pikachu team's real getTeamMatchup() output should surface
    // at least one of those under "Strong Against" — proving the numbers
    // come from the real calculation, not a hardcoded template.
    const strongAgainstCol = page.locator('.matchup-col', { hasText: 'Strong Against' });
    await expect(strongAgainstCol).toContainText(/water|flying/i);

    await expect(page.getByText(MOCK_TEAM[0].pokemonName, { exact: false }).first()).toBeVisible();
  });
});
