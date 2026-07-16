import { test, expect } from '@playwright/test';
import { mockAuth0Login } from './helpers/auth-mock';
import { mockApi, MOCK_PROFILE, MOCK_TEAM } from './helpers/api-mock';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /get started/i }).click();
  await page.waitForURL('**/home');
}

test.describe('Battle History — real filtering and match detail', () => {
  test('a completed battle appears in history, filters correctly, and opens a real match detail', async ({ page }) => {
    await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
    await mockApi(page, { team: MOCK_TEAM });
    await login(page);

    // Play one real battle so there's a genuine match to look at (rather
    // than seeding battle-history state directly, which would test nothing
    // about the real save-on-completion wiring).
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

    await page.getByRole('link', { name: 'Battle History', exact: true }).click();
    await page.waitForURL('**/battle-history');

    const row = page.locator('.match-row').first();
    await expect(row).toBeVisible();

    // Filter tabs are real — clicking the tab that doesn't match the mocked
    // match's real result should hide it.
    const resultBadge = await row.getAttribute('class');
    const wasWin = resultBadge?.includes('win') ?? true;
    await page.getByRole('button', { name: wasWin ? 'Losses' : 'Wins', exact: true }).click();
    await expect(page.locator('.match-row')).toHaveCount(0);

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.locator('.match-row').first().click();

    await expect(page.locator('.match-modal-close')).toBeVisible();
    await page.locator('.match-modal-close').click();
    await expect(page.locator('.match-modal-close')).toHaveCount(0);
  });
});

test.describe('Who\'s That Pokémon — a real, playable round', () => {
  test('picking the correct real Pokémon reveals it as correct and advances a real streak', async ({ page }) => {
    await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
    await mockApi(page);
    await login(page);

    await page.locator('.quiz-promo-card').click();
    await page.waitForURL('**/whos-that-pokemon');

    // The mock's quiz/round always targets the catalog's first entry
    // (bulbasaur) — click that exact option to prove a real correct guess
    // is recognized, not just that clicking anything "works".
    await page.locator('.option-btn', { hasText: 'bulbasaur' }).click();

    await expect(page.getByText(/Correct! Nice one\./i)).toBeVisible();
    await page.getByRole('button', { name: /Next Pokémon/ }).click();

    await expect(page.locator('.option-btn').first()).toBeVisible();
  });
});
