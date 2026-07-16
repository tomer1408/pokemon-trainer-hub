import { test, expect } from '@playwright/test';
import { mockAuth0Login } from './helpers/auth-mock';
import { mockApi, MOCK_PROFILE } from './helpers/api-mock';

// Full real Starter Quiz flow: answer all 6 questions, reach real
// recommendations (scored client-side against the mocked PokeAPI search
// pool), and add one straight from the results screen — a real POST to the
// mocked team endpoint.

test('answering every question reaches real recommendations, and Add to Team persists', async ({ page }) => {
  await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
  await mockApi(page, { team: [] });

  await page.goto('/');
  await page.getByRole('button', { name: /get started/i }).click();
  await page.waitForURL('**/home');

  await page.getByRole('link', { name: 'Starter Quiz' }).click();
  await page.waitForURL('**/starter-quiz');

  await page.getByRole('button', { name: 'Start Quiz' }).click();

  // 6 questions, each answered by clicking the first option — real
  // client-side scoring (quiz-recommendation.service.ts) runs afterward.
  for (let i = 0; i < 6; i++) {
    await page.locator('.option-card').first().click();
  }

  await expect(page.getByText('TOP MATCH')).toBeVisible({ timeout: 10_000 });

  const firstCard = page.locator('.rec-card-outer').first();
  await firstCard.getByRole('button', { name: 'Add to Team' }).click();
  await expect(firstCard.getByRole('button', { name: 'On Team' })).toBeVisible();
});

test('an incomplete quiz redirects Home straight to the quiz, and Skip for now genuinely lets you back into Home', async ({ page }) => {
  await mockAuth0Login(page, { name: MOCK_PROFILE.trainerName, email: 'ash@example.com' });
  await mockApi(page, { team: [], profile: { ...MOCK_PROFILE, hasCompletedStarterQuiz: false } });

  await page.goto('/');
  await page.getByRole('button', { name: /get started/i }).click();

  // starterQuizGuard redirects straight to /starter-quiz when the real
  // server-side flag says the quiz isn't done yet — never actually landing
  // on /home first.
  await page.waitForURL('**/starter-quiz');

  await page.getByRole('button', { name: 'Skip for now' }).click();

  // Skipping is honored for the rest of this tab session — the guard's own
  // session-skip check now lets /home load without bouncing back.
  await page.waitForURL('**/home');
});
