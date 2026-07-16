import { test, expect, Page } from '@playwright/test';
import { mockAuth0Login } from './helpers/auth-mock';
import { mockApi, MOCK_PROFILE } from './helpers/api-mock';

// Real write-flow E2E: adding/removing a Pokémon actually calls the (mocked)
// backend and the UI reflects the mutation — the gap flagged in e2e/README.md
// ("flows that write through the mocked API... aren't covered"). Persistence
// is proven by navigating away and back via real in-app links (which forces
// Angular to recreate the page and re-fetch), never via page.reload() — a
// hard reload drops the memory-only mocked Auth0 session (see
// authenticated-flow.spec.ts's own comment on this exact constraint).

async function login(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /get started/i }).click();
  await page.waitForURL('**/home');
}

async function goToExplorer(page: Page) {
  await page.getByRole('link', { name: 'Explorer', exact: true }).click();
  await page.waitForURL('**/explorer');
}

async function bounceThroughHome(page: Page) {
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.waitForURL('**/home');
}

// The mocked catalog has 50+ entries — searching by name (like a real user
// would) is what actually guarantees the target card is on-screen,
// regardless of which alphabetical/dex-sorted page it would otherwise fall
// on.
async function searchFor(page: Page, name: string) {
  await page.getByPlaceholder('Search Pokémon by name…').fill(name);
  const card = page.locator('.pokemon-card', { hasText: name });
  await expect(card).toBeVisible();
  return card;
}

test.describe('Explorer — add/remove/favorite (real write flow against the mocked API)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
    await mockApi(page, { team: [] });
  });

  test('adding a Pokémon to the team persists it server-side and updates the card label', async ({ page }) => {
    await login(page);
    await goToExplorer(page);

    const card = await searchFor(page, 'charmander');
    await card.getByRole('button', { name: 'Add to Team' }).click();
    await expect(card.getByRole('button', { name: 'Remove' })).toBeVisible();

    // Navigate away and back (real SPA navigation, re-fetches from the
    // mocked API) — proving the add was actually persisted, not just a
    // local UI flag.
    await bounceThroughHome(page);
    await goToExplorer(page);
    const cardAgain = await searchFor(page, 'charmander');
    await expect(cardAgain.getByRole('button', { name: 'Remove' })).toBeVisible();
  });

  test('favoriting a Pokémon persists after navigating away and back', async ({ page }) => {
    await login(page);
    await goToExplorer(page);

    const card = await searchFor(page, 'pikachu');
    await card.locator('.fav-btn').click();
    await expect(card.locator('.fav-btn')).toHaveText('♥');

    await bounceThroughHome(page);
    await goToExplorer(page);
    const cardAgain = await searchFor(page, 'pikachu');
    await expect(cardAgain.locator('.fav-btn')).toHaveText('♥');
  });

  test('the sidebar remove confirm actually removes the Pokémon from the real team', async ({ page }) => {
    await login(page);
    await goToExplorer(page);

    const card = await searchFor(page, 'squirtle');
    await card.getByRole('button', { name: 'Add to Team' }).click();
    await expect(page.locator('.slot-row.filled', { hasText: 'squirtle' })).toBeVisible();

    await page.locator('.slot-row.filled', { hasText: 'squirtle' }).locator('.remove-btn').click();
    await page.locator('.confirm-remove').click();
    await expect(page.locator('.slot-row.filled', { hasText: 'squirtle' })).toHaveCount(0);

    await bounceThroughHome(page);
    await goToExplorer(page);
    await expect(page.locator('.slot-row.filled', { hasText: 'squirtle' })).toHaveCount(0);
  });
});

test.describe('My Team — reflects real, persisted team state', () => {
  test('shows a team member added via Explorer, and My Team\'s own remove flow persists too', async ({ page }) => {
    await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
    await mockApi(page, { team: [] });
    await login(page);

    await goToExplorer(page);
    const card = await searchFor(page, 'bulbasaur');
    await card.getByRole('button', { name: 'Add to Team' }).click();

    await page.getByRole('link', { name: 'My Team', exact: true }).click();
    await page.waitForURL('**/my-team');
    await expect(page.locator('.slot-outer', { hasText: 'bulbasaur' })).toBeVisible();

    await page.locator('.slot-outer', { hasText: 'bulbasaur' }).click();
    await page.getByRole('button', { name: 'Remove from Team' }).click();
    await page.locator('.confirm-remove').click();
    await expect(page.locator('.slot-outer', { hasText: 'bulbasaur' })).toHaveCount(0);

    await bounceThroughHome(page);
    await page.getByRole('link', { name: 'My Team', exact: true }).click();
    await page.waitForURL('**/my-team');
    await expect(page.locator('.slot-outer', { hasText: 'bulbasaur' })).toHaveCount(0);
  });
});

test.describe('Notes — real add/delete against the mocked API', () => {
  test('adding a note to a Pokémon persists it in the detail modal after navigating away and back', async ({ page }) => {
    await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
    await mockApi(page, { team: [] });
    await login(page);
    await goToExplorer(page);

    const card = await searchFor(page, 'gengar');
    await card.click();
    await page.getByRole('button', { name: 'My Notes' }).click();
    await page.getByPlaceholder(/write a note/i).fill('Great for a spooky team.');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Great for a spooky team.')).toBeVisible();
    await page.locator('.close-btn').click();

    await bounceThroughHome(page);
    await goToExplorer(page);
    const cardAgain = await searchFor(page, 'gengar');
    await cardAgain.click();
    await page.getByRole('button', { name: 'My Notes' }).click();
    await expect(page.getByText('Great for a spooky team.')).toBeVisible();
  });
});
