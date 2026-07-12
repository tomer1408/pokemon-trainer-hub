import { defineConfig, devices } from '@playwright/test';

// E2E tests drive a real Chromium against the real running app (ng serve) —
// distinct from the vitest-based unit tests in src/app/**/*.spec.ts, which
// test isolated calculation logic, not the rendered UI. See e2e/README.md
// for what's covered here vs. what still needs a decision on test auth.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Reuses an already-running `ng serve` if one exists (common during local
  // dev) — only starts a fresh one, and tears it down after, in CI.
  webServer: {
    command: 'npx ng serve --port 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
