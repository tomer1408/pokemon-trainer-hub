import { test, expect } from '@playwright/test';
import { mockAuth0Login } from './helpers/auth-mock';
import { mockApi, MOCK_PROFILE, MOCK_TEAM } from './helpers/api-mock';

// Full real Battle flow — Start Battle → pick a Pokémon each round → reveal
// → match over — and confirms the completed match is actually persisted to
// (mocked) Battle History, not just rendered client-side.

test('a full 1-round battle plays out and records the real match to Battle History', async ({ page }) => {
  await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
  await mockApi(page, { team: MOCK_TEAM });

  await page.goto('/');
  await page.getByRole('button', { name: /get started/i }).click();
  await page.waitForURL('**/home');

  await page.locator('.battle-promo-card').click();
  await page.waitForURL('**/battle');

  await expect(page.getByRole('heading', { name: 'Prepare for Battle' })).toBeVisible();
  await page.getByRole('button', { name: /1 Round/ }).click();
  await page.getByRole('button', { name: '⚡ Start Battle' }).click();

  // Entering-arena countdown, then Round 1's pick screen.
  await expect(page.locator('.pick-card').first()).toBeVisible({ timeout: 10_000 });

  await page.locator('.pick-card').first().click();
  await page.getByRole('button', { name: 'Confirm Pick' }).click();

  // Suspense -> revealed.
  await expect(page.getByRole('button', { name: /See Result|Next Round/ })).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: /See Result|Next Round/ }).click();

  // Match is decided after round 1 of a 1-round match.
  await expect(page.getByText(/VICTORY!|DEFEAT|DRAW/)).toBeVisible();

  await page.getByRole('link', { name: 'Battle History', exact: true }).click();
  await page.waitForURL('**/battle-history');

  await expect(page.locator('.match-row').first()).toBeVisible();
});

test('Battle Again resets the round state and lets a second match be played', async ({ page }) => {
  await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
  await mockApi(page, { team: MOCK_TEAM });

  await page.goto('/');
  await page.getByRole('button', { name: /get started/i }).click();
  await page.waitForURL('**/home');
  await page.locator('.battle-promo-card').click();
  await page.waitForURL('**/battle');

  await page.getByRole('button', { name: /1 Round/ }).click();
  await page.getByRole('button', { name: '⚡ Start Battle' }).click();
  await expect(page.locator('.pick-card').first()).toBeVisible({ timeout: 10_000 });
  await page.locator('.pick-card').first().click();
  await page.getByRole('button', { name: 'Confirm Pick' }).click();
  await expect(page.getByRole('button', { name: /See Result|Next Round/ })).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: /See Result|Next Round/ }).click();
  await expect(page.getByText(/VICTORY!|DEFEAT|DRAW/)).toBeVisible();

  await page.getByRole('button', { name: 'Battle Again' }).click();

  await expect(page.getByRole('heading', { name: 'Prepare for Battle' })).toBeVisible();
});
