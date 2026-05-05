/**
 * Capture hero images of the live demo for README.
 *
 * Uses the Playwright Chromium already installed by the post-deploy smoke setup.
 * Run: pnpm tsx scripts/capture-hero.ts
 *
 * Outputs:
 *   docs/hero/marketplace-home.png   — multi-merchant landing
 *   docs/hero/storefront-akami.png   — brand-aware tenant storefront
 *   docs/hero/storefront-afen.png    — second tenant for contrast
 *
 * Each at 1440x900 (typical hero/screenshot ratio for README rendering).
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const BASE = process.env.HERO_BASE_URL ?? 'https://demo-sass-2.vercel.app';
const OUT_DIR = join(process.cwd(), 'docs/hero');

mkdirSync(OUT_DIR, { recursive: true });

async function capture() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // retina-quality for GitHub README rendering
  });
  const page = await context.newPage();

  const shots: Array<[string, string]> = [
    [`${BASE}/`, 'marketplace-home.png'],
    [`${BASE}/store/akami`, 'storefront-akami.png'],
    [`${BASE}/store/afen`, 'storefront-afen.png'],
  ];

  for (const [url, file] of shots) {
    console.log(`→ ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    // Let any client-side hydration / image lazy-load settle
    await page.waitForTimeout(1500);
    const out = join(OUT_DIR, file);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`  ✓ ${out}`);
  }

  await browser.close();
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
