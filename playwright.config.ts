import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for smoke tests.
 *
 * Three profiles:
 * - `chromium` (default): public-surface smoke against PROD URL. Used by
 *   .github/workflows/post-deploy-smoke.yml. Runs *.smoke.ts EXCEPT the
 *   `*-local.smoke.ts` files (those need a running dev server + OpenAI key).
 * - `local-ai` (V2.6.2 hotfix automation): operator runs `pnpm test:smoke:ai-local`.
 *   Hits localhost + Inngest dev CLI + real OpenAI. Slow + costs ~$0.02/run.
 *   Excluded from CI by `testIgnore` on the chromium project.
 *
 * Tests live in tests/smoke/. They are intentionally separate from vitest
 * (different runner, different concerns: vitest = unit + integration on
 * local DB, Playwright = end-to-end against deployed URL or local dev).
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
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], baseURL: PROD_URL },
      // V2.6.2: keep the expensive local-ai smoke out of post-deploy CI.
      testIgnore: /.*-local\.smoke\.ts/,
    },
    {
      name: 'local-ai',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3000' },
      // 2 minutes per test — vision call alone can take 60s on cold start.
      timeout: 120_000,
      testMatch: /.*-local\.smoke\.ts/,
      // Only one worker — needs DB + dev-server + Inngest exclusivity.
      workers: 1,
    },
  ],
});
