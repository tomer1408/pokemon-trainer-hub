import { test, expect } from '@playwright/test';
import { mockAuth0Login } from './helpers/auth-mock';
import { mockApi, MOCK_PROFILE, MOCK_TEAM } from './helpers/api-mock';

const FAVORITE_CHARMANDER = {
  pokemonId: 4,
  pokemonName: 'charmander',
  spriteUrl: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png',
  addedAt: '2026-01-01T00:00:00.000Z',
  position: 0,
  stats: [{ name: 'hp', value: 39 }],
  types: ['fire'],
  baseExperience: 62,
};

async function login(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /get started/i }).click();
  await page.waitForURL('**/home');
}

async function goToManageTeam(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'My Team', exact: true }).click();
  await page.waitForURL('**/my-team');
  await page.getByRole('link', { name: 'Manage My Team' }).click();
  await page.waitForURL('**/manage-team');
}

// Real drag-and-drop E2E — proves the draft-until-Save architecture
// (CLAUDE.md's own key product decision for this page): dragging a favorite
// into the team only stages it locally; nothing reaches the mocked backend
// until Save Changes is actually clicked.

test('dragging a favorite into an empty team slot stages it as a draft, and Save Changes persists it', async ({ page }) => {
  await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
  await mockApi(page, { team: MOCK_TEAM, favorites: [FAVORITE_CHARMANDER] });
  await login(page);
  await goToManageTeam(page);

  const favoriteCard = page.locator('.pool-card', { hasText: 'charmander' });
  const emptySlot = page.locator('.slot-empty').first();
  await expect(favoriteCard).toBeVisible();
  await expect(emptySlot).toBeVisible();

  await favoriteCard.dragTo(emptySlot);
  await expect(page.locator('.slot-outer', { hasText: 'charmander' })).toBeVisible();

  await page.locator('.save-btn').click();
  await page.locator('.confirm-save').click();
  await expect(page.getByText('Team changes saved successfully.')).toBeVisible();

  // Navigate away and back — a real SPA nav re-fetches from the mocked
  // backend, proving the drag was actually persisted, not just local draft
  // state.
  await page.getByRole('button', { name: 'Back to My Team', exact: true }).click();
  await page.waitForURL('**/my-team');
  await expect(page.locator('.slot-outer', { hasText: 'charmander' })).toBeVisible();
});

test('Revert genuinely restores the pre-visit team, even after a confirmed drag-to-trash removal', async ({ page }) => {
  await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
  await mockApi(page, { team: MOCK_TEAM, favorites: [] });
  await login(page);
  await goToManageTeam(page);

  const teamSlot = page.locator('.slot-outer', { hasText: MOCK_TEAM[0].pokemonName });
  const trash = page.locator('.trash-zone');
  await expect(teamSlot).toBeVisible();

  await teamSlot.dragTo(trash);
  await expect(page.getByText('Remove this Pokémon from your Dream Team?')).toBeVisible();
  await page.locator('.confirm-delete').click();
  await expect(page.getByText('Pokémon removed from your Dream Team.')).toBeVisible();
  await expect(page.locator('.slot-outer', { hasText: MOCK_TEAM[0].pokemonName })).toHaveCount(0);

  await page.getByRole('button', { name: 'Revert', exact: true }).click();
  await page.getByRole('button', { name: 'Revert Changes', exact: true }).click();

  await expect(page.locator('.slot-outer', { hasText: MOCK_TEAM[0].pokemonName })).toBeVisible();

  // Leaving now (nothing unsaved after a Revert) should not ask for
  // confirmation at all — proving Revert really did clear the dirty state.
  await page.getByRole('button', { name: 'Back to My Team', exact: true }).click();
  await page.waitForURL('**/my-team');
});

test('Leave without saving discards a staged drag when navigating away', async ({ page }) => {
  await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
  await mockApi(page, { team: MOCK_TEAM, favorites: [FAVORITE_CHARMANDER] });
  await login(page);
  await goToManageTeam(page);

  const favoriteCard = page.locator('.pool-card', { hasText: 'charmander' });
  const emptySlot = page.locator('.slot-empty').first();
  await favoriteCard.dragTo(emptySlot);
  await expect(page.locator('.slot-outer', { hasText: 'charmander' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to My Team', exact: true }).click();
  await expect(page.getByText('Leave without saving?')).toBeVisible();
  await page.getByRole('button', { name: 'Leave Without Saving', exact: true }).click();

  await page.waitForURL('**/my-team');
  await expect(page.locator('.slot-outer', { hasText: 'charmander' })).toHaveCount(0);
});
