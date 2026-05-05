import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for post-deploy smoke tests.
 *
 * Two profiles:
 * - default (no --project flag): hits the production URL, used by CI
 *   .github/workflows/post-deploy-smoke.yml
 * - local: hits http://localhost:3000, useful for editing tests
 *
 * Tests live in tests/smoke/. They are intentionally separate from vitest
 * (different runner, different concerns: vitest = unit + integration on
 * local DB, Playwright = end-to-end against deployed URL).
 */

const PROD_URL = process.env.SMOKE_BASE_URL || 'https://demo-sass-2.vercel.app';

export default defineConfig({
  testDir: './tests/smoke',
  testMatch: /.*\.smoke\.ts/,
  // Smoke is sequential by default — fewer concurrent hits on prod
  fullyParallel: false,
  workers: 2,
  // Don't retry on CI; we want flake to be visible
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: PROD_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Be polite to the deployed server
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
