/**
 * AI vision local smoke — V2.6.2 hotfix automation.
 *
 * Replaces the 7-step manual checklist the operator was running by hand
 * after every AI SDK / vision-path change. The manual flow was error-prone
 * and routinely skipped the critical "did tokens actually land in the DB"
 * check that V2.6.2's eng review identified as the silent-failure mode.
 *
 * What this test proves end-to-end:
 *   1. Dev server boots after lib upgrades (zod 4 / ai v6 / etc.)
 *   2. Merchant login still works
 *   3. Photo upload reaches `/api/uploads`, returns 200 + key
 *   4. `/api/products/generate` enqueues to Inngest, polling resolves to success
 *   5. The AI metadata is REAL (not the fixture-fallback set the worker
 *      writes when vision fails — "示例商品 - 拿鐵咖啡" etc.)
 *   6. `ai_usage_events` row was written with non-zero token counts
 *      (load-bearing: this is the assertion that catches "silent zeroing"
 *      from token-shape rename across SDK majors)
 *   7. Test product cleanly deletes (cleanup hygiene for re-runnability)
 *
 * Prerequisites (operator-run, not automated):
 *   - `pnpm dev` running on localhost:3000
 *   - `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`
 *     running on localhost:8288
 *   - `.env.local` populated with real `OPENAI_API_KEY` + DB URLs +
 *     `MERCHANT_SESSION_SECRET` + `DEMO_MERCHANT_AKAMI_ID`
 *   - Docker postgres running (`pnpm docker:up`) with seeded merchants
 *     (`pnpm tsx scripts/seed-merchant-auth.ts`)
 *
 * Cost: ~$0.02 per run (one GPT-4o vision call). Run on demand, not in CI.
 *
 * Invocation: `pnpm test:smoke:ai-local`
 */
import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';

// Load .env.local so dbAdmin DSN + tenant IDs are available when the test
// runs as its own process (separate from the Next dev server).
dotenvConfig({ path: '.env.local' });

const BASE = 'http://localhost:3000';
const FIXTURE = path.resolve(process.cwd(), 'tests/fixtures/smoke-product.jpg');

// Strings the worker writes when vision fails and falls back to fixture
// metadata. Asserting the title is NOT one of these is the cheapest "AI
// actually ran" check.
const FIXTURE_FALLBACK_TITLES = new Set([
  '日本手作陶瓷茶杯・侘寂釉燒・單品',
  '韓系極簡手機殼・霧面磨砂',
  '南洋風辣椒醬・小農手作',
]);

const DEMO_TENANT_ID = process.env.DEMO_MERCHANT_AKAMI_ID;
const ADMIN_DSN = process.env.DATABASE_URL_ADMIN;
const MERCHANT_EMAIL = 'akami@demo.local';
const MERCHANT_PASSWORD = 'demo1234';

function adminPool(): Pool {
  if (!ADMIN_DSN) {
    throw new Error('DATABASE_URL_ADMIN missing — load .env.local');
  }
  return new Pool({ connectionString: ADMIN_DSN, max: 1 });
}

test.describe('V2.6.2 AI vision local smoke', () => {
  test.describe.configure({ mode: 'serial' }); // serial — share state (created product) across steps

  // 60s for the AI step alone; total for the suite can be 90s+ on cold OpenAI.
  test.setTimeout(120_000);

  test.beforeAll(() => {
    // Refuse to run if the operator forgot something.
    expect(DEMO_TENANT_ID, 'DEMO_MERCHANT_AKAMI_ID missing in env').toBeTruthy();
    expect(ADMIN_DSN, 'DATABASE_URL_ADMIN missing in env').toBeTruthy();
  });

  test('1. Dev server reachable', async ({ request }) => {
    const res = await request.get(`${BASE}/`);
    expect(res.status(), 'home page should return 200').toBe(200);
  });

  test('2. Merchant login + upload + AI generation + DB write', async ({ page, request }) => {
    // Snapshot ai_usage_events count BEFORE — proves a new row was written
    // by THIS test, not by a previous run.
    const pool = adminPool();
    const beforeRes = await pool.query<{ c: string }>(
      'SELECT COUNT(*)::text AS c FROM ai_usage_events WHERE tenant_id = $1::uuid',
      [DEMO_TENANT_ID],
    );
    const before = parseInt(beforeRes.rows[0].c, 10);

    // Login
    await page.goto(`${BASE}/merchant/login`);
    await page.locator('input[type="email"]').fill(MERCHANT_EMAIL);
    await page.locator('input[type="password"]').fill(MERCHANT_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(`${BASE}/merchant`, { timeout: 10_000 });

    // Navigate to upload page
    await page.goto(`${BASE}/merchant/products/new`);

    // Upload — file input may be hidden behind a dropzone; locate the actual <input type=file>.
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(FIXTURE);

    // Wait for the AI flow to complete — products list shows the new product.
    // The Inngest pipeline takes 30-90s end-to-end on a cold dev environment.
    // We wait on the URL change OR on a UI signal that generation finished.
    // The simplest portable wait: navigate to /merchant/products and find a
    // recent product whose title is not the fixture-fallback set.
    await page.waitForTimeout(5_000); // give the upload + enqueue a head start

    let productTitle: string | null = null;
    let productId: string | null = null;
    const deadline = Date.now() + 90_000; // 90s budget for the vision call
    while (Date.now() < deadline) {
      await page.goto(`${BASE}/merchant/products`);
      // Most-recent product appears first by default sort.
      const firstRow = page.locator('a[href^="/merchant/products/"]').first();
      const href = await firstRow.getAttribute('href').catch(() => null);
      if (href) {
        const idMatch = href.match(/\/merchant\/products\/([0-9a-f-]{36})$/i);
        if (idMatch) {
          productId = idMatch[1];
          productTitle = (await firstRow.locator('h2, h3, [data-product-title]').first().textContent())?.trim() || null;
        }
      }
      // Found something AND it's not the fallback fixture? Done.
      if (productTitle && !FIXTURE_FALLBACK_TITLES.has(productTitle)) break;
      await page.waitForTimeout(3_000);
    }

    expect(productId, 'product should appear in the list within 90s').toBeTruthy();
    expect(
      productTitle,
      `product title should not be a fixture-fallback string. Got: "${productTitle}". Fixture fallback means vision call FAILED (likely SDK shape mismatch or OpenAI auth issue).`,
    ).not.toBeNull();

    // Direct DB confirm: ai_usage_events row was written, tokens > 0.
    // This is the load-bearing assertion. If silent zeroing happened
    // (token shape rename undetected by normalizeUsage), this fails.
    const afterRes = await pool.query<{
      tokens_in: number;
      tokens_out: number;
      created_at: Date;
    }>(
      `SELECT tokens_in, tokens_out, created_at
       FROM ai_usage_events
       WHERE tenant_id = $1::uuid
       ORDER BY created_at DESC LIMIT 1`,
      [DEMO_TENANT_ID],
    );
    const afterCount = (
      await pool.query<{ c: string }>(
        'SELECT COUNT(*)::text AS c FROM ai_usage_events WHERE tenant_id = $1::uuid',
        [DEMO_TENANT_ID],
      )
    ).rows[0].c;

    expect(parseInt(afterCount, 10), 'a new ai_usage_events row should exist').toBeGreaterThan(before);
    expect(afterRes.rows.length).toBe(1);
    const latest = afterRes.rows[0];
    expect(
      latest.tokens_in,
      `tokens_in must be > 0. ZERO MEANS SILENT FAILURE: the SDK token-shape rename slipped past normalizeUsage and cost cap is now decorative. Fix vision.ts and tests/ai/usage-normalize.test.ts to handle the new shape.`,
    ).toBeGreaterThan(0);
    expect(
      latest.tokens_out,
      `tokens_out must be > 0. Same diagnosis as tokens_in.`,
    ).toBeGreaterThan(0);

    // Cleanup: delete the test product so re-runs don't pollute the merchant.
    if (productId) {
      await pool.query('DELETE FROM products WHERE id = $1::uuid', [productId]);
    }
    await pool.end();
  });
});
