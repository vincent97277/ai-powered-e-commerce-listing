/**
 * Capture README screenshots of the live demo.
 *
 * Companion to scripts/capture-hero.ts (which captures the single big hero
 * shot for the very top of README). This script captures the supporting
 * screenshots that appear in the README "See it in action" section + extras
 * for the V2.6 RLS-template positioning.
 *
 * Run:
 *   pnpm tsx scripts/capture-screenshots.ts
 *
 * Defaults to prod URL (https://rls-ai-shop.vercel.app). Override with:
 *   HERO_BASE_URL=http://localhost:3000 pnpm tsx scripts/capture-screenshots.ts
 *
 * Auth-gated captures (merchant inbox, admin queue) only fire when:
 *   - Dev server is running (HERO_BASE_URL points at localhost)
 *   - .env.local has MERCHANT_SESSION_SECRET + ADMIN_PASSWORD set
 *   - Demo merchant `akami@demo.local` exists with password `demo1234`
 *     (run `pnpm tsx scripts/seed-merchant-auth.ts --mode=dev` once)
 *
 * On prod (public-only), the script captures 4 surfaces. With local auth, it
 * captures 6 + one composed brand-comparison image.
 */
import { chromium, type Page } from '@playwright/test';
import { join } from 'node:path';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const BASE = process.env.HERO_BASE_URL ?? 'https://rls-ai-shop.vercel.app';
const OUT_DIR = join(process.cwd(), 'docs/screenshots');
const VIEWPORT = { width: 1440, height: 900 };

mkdirSync(OUT_DIR, { recursive: true });

// Load .env.local for creds without polluting process.env globally.
function loadEnvLocal(): Record<string, string> {
  const envPath = join(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

async function shoot(page: Page, file: string, fullPage = false): Promise<void> {
  const out = join(OUT_DIR, file);
  await page.screenshot({ path: out, fullPage });
  console.log(`  ✓ ${out}`);
}

async function capturePublic(page: Page): Promise<void> {
  // Storefronts — full-page so the brand theming reads end-to-end.
  for (const slug of ['akami', 'afen']) {
    const url = `${BASE}/store/${slug}`;
    console.log(`→ ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(1500);
    await shoot(page, `storefront-${slug}-full.png`, true);
  }

  // Login forms — viewport-only, focused on the form not the whole page.
  for (const surface of ['merchant', 'admin']) {
    const url = `${BASE}/${surface}/login`;
    console.log(`→ ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(800);
    await shoot(page, `auth-${surface}-login.png`);
  }
}

async function composeComparison(): Promise<void> {
  const akami = join(OUT_DIR, 'storefront-akami-full.png');
  const afen = join(OUT_DIR, 'storefront-afen-full.png');
  if (!existsSync(akami) || !existsSync(afen)) {
    console.log('  ⊘ skipping brand comparison — source images missing');
    return;
  }
  // Side-by-side at half scale (each becomes 720 wide), so the combined image
  // is 1440 wide and matches the rest of the README's image rhythm. We crop
  // each storefront to a consistent 1200px height to keep the comparison
  // visually clean.
  const targetH = 1200;
  const targetW = 720;
  const akamiBuf = await sharp(akami)
    .resize({ width: 1440, height: targetH * 2, fit: 'cover', position: 'top' })
    .resize({ width: targetW, height: targetH })
    .toBuffer();
  const afenBuf = await sharp(afen)
    .resize({ width: 1440, height: targetH * 2, fit: 'cover', position: 'top' })
    .resize({ width: targetW, height: targetH })
    .toBuffer();
  const out = join(OUT_DIR, 'storefront-brand-comparison.png');
  await sharp({
    create: {
      width: targetW * 2,
      height: targetH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: akamiBuf, left: 0, top: 0 },
      { input: afenBuf, left: targetW, top: 0 },
    ])
    .png()
    .toFile(out);
  console.log(`  ✓ ${out} (akami | afen brand comparison)`);
}

async function captureMerchantInbox(page: Page, password: string): Promise<void> {
  console.log(`→ ${BASE}/merchant/login (auto-fill, then capture inbox)`);
  await page.goto(`${BASE}/merchant/login`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.locator('input[type="email"]').fill('akami@demo.local');
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`${BASE}/merchant`, { timeout: 10_000 });
  await page.waitForTimeout(1500);
  await shoot(page, 'merchant-inbox.png');
}

async function captureAdminQueue(page: Page, password: string): Promise<void> {
  console.log(`→ ${BASE}/admin/login (auto-fill, then capture queue)`);
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin/, { timeout: 10_000 });
  // Try the queue page first; fall back to admin home if route not present.
  const queue = `${BASE}/admin/queue`;
  await page.goto(queue, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(1500);
  await shoot(page, 'admin-onboarding-queue.png');
}

async function main(): Promise<void> {
  const env = loadEnvLocal();
  const isLocal = BASE.startsWith('http://localhost');
  const merchantPw = isLocal ? 'demo1234' : null;
  const adminPw = isLocal ? env.ADMIN_PASSWORD ?? null : null;

  console.log(`Base: ${BASE}`);
  console.log(`Auth-gated captures: ${isLocal && merchantPw && adminPw ? 'enabled' : 'skipped (set HERO_BASE_URL=http://localhost:3000 + start dev server + ensure .env.local has ADMIN_PASSWORD)'}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    await capturePublic(page);
    await composeComparison();

    if (isLocal && merchantPw) {
      await captureMerchantInbox(page, merchantPw);
    }
    if (isLocal && adminPw) {
      // New context so admin login doesn't share cookies with the merchant session.
      const adminCtx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
      const adminPage = await adminCtx.newPage();
      await captureAdminQueue(adminPage, adminPw);
      await adminCtx.close();
    }
  } finally {
    await browser.close();
  }

  console.log('\nDone. Captured to docs/screenshots/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
