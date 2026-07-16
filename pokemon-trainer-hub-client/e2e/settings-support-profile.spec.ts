import { test, expect } from '@playwright/test';
import { mockAuth0Login } from './helpers/auth-mock';
import { mockApi, MOCK_PROFILE } from './helpers/api-mock';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /get started/i }).click();
  await page.waitForURL('**/home');
}

// Settings and Support are only reachable from the account-menu dropdown
// (navbar.html only links Home/Explorer/My Team/My Profile directly).
async function openAccountMenuLink(page: import('@playwright/test').Page, name: string, url: string) {
  await page.locator('.avatar-btn').click();
  await page.getByRole('link', { name, exact: true }).click();
  await page.waitForURL(url);
}

test.describe('Settings — real save flow against the mocked API', () => {
  test('toggling the marketing email preference and saving persists it', async ({ page }) => {
    await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
    await mockApi(page);
    await login(page);

    await openAccountMenuLink(page, 'Settings', '**/settings');

    await expect(page.getByText('Send me trainer tips, team suggestions, and app updates by email.')).toBeVisible();
    await page.getByText('Send me trainer tips, team suggestions, and app updates by email.').click();
    await page.getByRole('button', { name: 'Save Settings' }).click();

    await expect(page.getByText('Settings saved')).toBeVisible();

    // Navigate away and back (real SPA nav) to prove the mocked backend
    // actually persisted the flip, not just local component state.
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.waitForURL('**/home');
    await openAccountMenuLink(page, 'Settings', '**/settings');

    const checkbox = page.locator('.check-row', { hasText: 'Send me trainer tips' }).locator('.check-box');
    await expect(checkbox).toHaveClass(/checked/);
  });
});

test.describe('Support — real submission against the mocked API', () => {
  test('submitting a support request shows the real confirmation state', async ({ page }) => {
    await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
    await mockApi(page);
    await login(page);

    await openAccountMenuLink(page, 'Support', '**/support');

    await page.getByPlaceholder('Your name').fill('Ash Ketchum');
    await page.getByRole('button', { name: 'Bug Report', exact: true }).click();
    await page.getByPlaceholder(/describe what happened/i).fill('The battle screen looked great!');
    await page.getByRole('button', { name: 'Send Support Request' }).click();

    await expect(page.getByText('Thanks! Your support request was received.')).toBeVisible();
  });

  test('rejects submission with an invalid email, without ever hitting the backend', async ({ page }) => {
    await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
    await mockApi(page);
    await login(page);

    await openAccountMenuLink(page, 'Support', '**/support');

    let supportCalled = false;
    await page.route('**/api/support', async (route) => {
      supportCalled = true;
      await route.continue();
    });

    await page.getByPlaceholder('you@email.com').fill('not-an-email');
    await page.getByRole('button', { name: 'Bug Report', exact: true }).click();
    await page.getByPlaceholder(/describe what happened/i).fill('Testing invalid email.');
    await page.getByRole('button', { name: 'Send Support Request' }).click();

    await expect(page.getByText('Thanks! Your support request was received.')).not.toBeVisible();
    expect(supportCalled).toBe(false);
  });
});

test.describe('Profile — real edit/save flow against the mocked API', () => {
  test('editing the team name in the profile modal persists it after navigating away and back', async ({ page }) => {
    await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
    await mockApi(page);
    await login(page);

    await page.getByRole('navigation').getByRole('link', { name: 'My Profile' }).click();
    await page.waitForURL('**/profile');

    await page.getByRole('button', { name: 'Edit Profile' }).click();
    await page.getByPlaceholder('Name your Dream Team (optional)').fill('Thunder Legends');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.getByRole('button', { name: 'Yes, Save' }).click();

    await expect(page.getByText('Thunder Legends')).toBeVisible();

    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.waitForURL('**/home');
    await page.getByRole('navigation').getByRole('link', { name: 'My Profile' }).click();
    await page.waitForURL('**/profile');

    await expect(page.getByText('Thunder Legends')).toBeVisible();
  });

  test('closing the edit modal with unsaved changes asks to discard, and discarding reverts the field', async ({ page }) => {
    await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
    await mockApi(page);
    await login(page);

    await page.getByRole('navigation').getByRole('link', { name: 'My Profile' }).click();
    await page.waitForURL('**/profile');

    await page.getByRole('button', { name: 'Edit Profile' }).click();
    await page.getByPlaceholder('Name your Dream Team (optional)').fill('Unsaved Name');

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText('Discard changes?')).toBeVisible();
    await page.getByRole('button', { name: 'Discard Changes' }).click();

    await expect(page.getByText('Unsaved Name')).not.toBeVisible();
    await expect(page.getByText(MOCK_PROFILE.teamName)).toBeVisible();
  });
});
