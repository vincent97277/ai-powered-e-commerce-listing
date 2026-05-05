/**
 * Post-deploy smoke — V2.3.3 throughput improvement.
 *
 * Runs against the live production URL after every push to main. Fails loud
 * if any of the public-surface routes is broken. Operator gets a red ❌ on
 * the commit / PR, knows to investigate.
 *
 * What this catches that CI alone can't:
 *  - V2.2.4 R2 storage migration regressions (image URLs)
 *  - V2.2.13-style frontend bundle issues
 *  - Cold-start crashes (env validation, instrumentation)
 *  - DB connection issues (Neon paused / pooled URL wrong)
 *  - R2 public bucket access regressions
 *
 * What this DOES NOT cover (Phase 2 / login-required):
 *  - /admin/login flow (needs ADMIN_PASSWORD secret)
 *  - /merchant/login flow (needs merchant credentials)
 *  - Photo upload pipeline (needs auth + costs OpenAI)
 *  These can be added later as gated suites.
 */
import { test, expect } from '@playwright/test';

test.describe('public surface', () => {
  test('homepage renders with brand name', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    // V1.9 brand: "Catalogify" should be in the hero
    await expect(page.locator('body')).toContainText(/Catalogify|多商家|商品/);
  });

  test('storefront /store/akami responds (200 or 503-suspended)', async ({ page }) => {
    // Akami may be active or suspended depending on admin approval state
    const res = await page.goto('/store/akami');
    // Either active storefront (200) or suspended page (200 with 暫停營業 banner) — both fine
    expect(res?.status()).toBeLessThan(500);
  });

  test('storefront /store/afen responds (200 or 503-suspended)', async ({ page }) => {
    const res = await page.goto('/store/afen');
    expect(res?.status()).toBeLessThan(500);
  });

  test('about page renders', async ({ page }) => {
    const res = await page.goto('/about');
    expect(res?.status()).toBe(200);
  });

  test('privacy + terms render', async ({ page }) => {
    const r1 = await page.goto('/privacy');
    expect(r1?.status()).toBe(200);
    const r2 = await page.goto('/terms');
    expect(r2?.status()).toBe(200);
  });

  test('onboarding form renders', async ({ page }) => {
    const res = await page.goto('/onboarding');
    expect(res?.status()).toBe(200);
    // Onboarding has slug input
    await expect(page.locator('input[name="slug"], input[name=slug]').first()).toBeVisible();
  });
});

test.describe('auth gates', () => {
  test('admin login page renders', async ({ page }) => {
    const res = await page.goto('/admin/login');
    expect(res?.status()).toBe(200);
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('merchant login page renders', async ({ page }) => {
    const res = await page.goto('/merchant/login');
    expect(res?.status()).toBe(200);
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('/admin redirects to /admin/login when no cookie', async ({ page }) => {
    const res = await page.goto('/admin');
    // Either 200 on /admin/login (redirect followed) or 307
    expect(page.url()).toContain('/admin/login');
  });

  test('/merchant redirects to /merchant/login when no cookie', async ({ page }) => {
    const res = await page.goto('/merchant');
    expect(page.url()).toContain('/merchant/login');
  });
});

test.describe('API surface', () => {
  test('/api/health returns ok=true', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('/api/uploads requires auth (redirect or 401/403/307)', async ({ request }) => {
    const res = await request.post('/api/uploads', {
      data: {},
      maxRedirects: 0,
    });
    // Either redirect to merchant login, or 4xx auth error — never 200, never 500
    expect([307, 308, 401, 403]).toContain(res.status());
  });

  test('/api/products/generate without cookie redirects to login', async ({ request }) => {
    const res = await request.post('/api/products/generate', {
      data: { storageKey: 'fake/key.jpg' },
      maxRedirects: 0,
    });
    expect([307, 308, 401, 403]).toContain(res.status());
  });
});

test.describe('performance sanity', () => {
  test('homepage TTFB under 5s (warm path tolerance)', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    const elapsed = Date.now() - start;
    // 5s is generous — warm path should be under 1s, cold start could be 2-4s
    // Failing this means cold start regressed badly OR Vercel function is broken
    expect(elapsed).toBeLessThan(5000);
  });

  test('/api/health responds under 2s', async ({ request }) => {
    const start = Date.now();
    const res = await request.get('/api/health');
    const elapsed = Date.now() - start;
    expect(res.status()).toBe(200);
    expect(elapsed).toBeLessThan(2000);
  });
});
