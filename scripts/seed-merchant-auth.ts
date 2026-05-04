/**
 * scripts/seed-merchant-auth.ts — V2 per-merchant auth backfill
 *
 * Why: 0008_v2_merchant_auth.sql 只加 schema (email + password_hash columns),
 * 沒在 migration 內 backfill — 不想把 bcrypt cost / hash 格式寫死在 SQL.
 * 真正的 hash 由這支 script 在 application layer 產, 跟 task 103 用同一個 lib.
 *
 * V2.2.2 hardening:
 *   - --mode flag for dev (single shared password) vs prod (random per-merchant
 *     passwords + suspendedAt set)
 *   - 預設 mode 在 NODE_ENV=production 是 prod-random-suspended; 否則 dev-shared
 *   - prod mode 一律印警告 "demo merchants are SUSPENDED, run admin approval to
 *     activate" — 沒有 admin approve 的話 storefront 看不到, login 也擋掉
 *   - dev mode 跟以前一樣, demo1234 共用密碼方便測試
 *
 * 用法:
 *   # local dev (預設) — demo1234 共用密碼, 不 suspend
 *   pnpm tsx scripts/seed-merchant-auth.ts
 *
 *   # production — random passwords, all suspended pending admin approval
 *   NODE_ENV=production pnpm tsx scripts/seed-merchant-auth.ts
 *   pnpm tsx scripts/seed-merchant-auth.ts --mode=prod
 *
 *   # dev mode forced even with NODE_ENV=production (escape hatch)
 *   pnpm tsx scripts/seed-merchant-auth.ts --mode=dev
 *
 * Idempotent: 已經有 email 的 merchant 跳過, 不會覆蓋.
 *
 * 安全注意 (從 V2.2.2 review):
 *   - "demo1234" 共用密碼直接 seed 到 prod 是 backdoor (anyone reading docs can
 *     login as any merchant). prod mode 改成 random + suspended.
 *   - prod mode 印出的密碼僅 stdout, 用完即丟 — 建議 redirect 到 sealed file:
 *       NODE_ENV=production pnpm tsx scripts/seed-merchant-auth.ts > /tmp/creds.txt
 *       chmod 600 /tmp/creds.txt
 *   - 此 script 用 dbAdmin (BYPASSRLS) 直接 UPDATE merchants. Console 跑.
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq, isNull } from 'drizzle-orm';

// 必須在 import @/db 之前 load .env.local — 否則 lazy init 抓不到 DATABASE_URL_*
config({ path: resolve(process.cwd(), '.env.local') });

type Mode = 'dev' | 'prod';

function pickMode(): Mode {
  const flag = process.argv.find((a) => a.startsWith('--mode='));
  if (flag) {
    const v = flag.split('=')[1];
    if (v === 'dev' || v === 'prod') return v;
    throw new Error(`Invalid --mode value: ${v}. Use --mode=dev or --mode=prod`);
  }
  return process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
}

/**
 * Generate a 16-char URL-safe random password (~96 bits of entropy via base64url).
 * Strong enough that brute-force is infeasible; short enough to copy-paste.
 */
function generateRandomPassword(): string {
  return randomBytes(12).toString('base64url').slice(0, 16);
}

async function main() {
  const mode = pickMode();
  const { dbAdmin } = await import('../src/db/admin-only');
  const { merchants } = await import('../src/db/schema');

  const BCRYPT_COST = 10;
  const DEV_PASSWORD = 'demo1234';

  const rows = await dbAdmin
    .select({ id: merchants.id, slug: merchants.slug, name: merchants.name })
    .from(merchants)
    .where(isNull(merchants.email));

  if (rows.length === 0) {
    console.log('No merchants needed backfill — all have email.');
    return;
  }

  console.log(
    `Mode: ${mode.toUpperCase()}. Backfilling ${rows.length} merchant(s)...\n`,
  );

  const results: Array<{ slug: string; email: string; password: string }> = [];
  const now = new Date();
  const SUSPENDED_REASON =
    'V2.2.2 prod-seed: pending admin approval before publishing storefront';

  for (const row of rows) {
    const email = `${row.slug}@demo.local`;
    const password = mode === 'prod' ? generateRandomPassword() : DEV_PASSWORD;
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    if (mode === 'prod') {
      await dbAdmin
        .update(merchants)
        .set({
          email,
          passwordHash,
          // Storefront 看不到 + login 擋掉, 直到 admin 在後台手動 approve
          suspendedAt: now,
          suspendedReason: SUSPENDED_REASON,
        })
        .where(eq(merchants.id, row.id));
    } else {
      await dbAdmin
        .update(merchants)
        .set({ email, passwordHash })
        .where(eq(merchants.id, row.id));
    }

    results.push({ slug: row.slug, email, password });
  }

  if (mode === 'prod') {
    console.log('⚠️  PROD MODE: All seeded merchants are SUSPENDED.');
    console.log(
      '   Storefronts will show "暫停營業中" until you un-suspend via admin dashboard.\n',
    );
  }

  console.log('Credentials (write down NOW — printed only once):\n');
  console.log(
    '| slug                  | email                                | password         |',
  );
  console.log(
    '|-----------------------|--------------------------------------|------------------|',
  );
  for (const r of results) {
    console.log(
      `| ${r.slug.padEnd(21)} | ${r.email.padEnd(36)} | ${r.password.padEnd(16)} |`,
    );
  }

  if (mode === 'dev') {
    console.log('\n(Dev mode: shared password "demo1234" — never use this in prod.)');
  } else {
    console.log(
      '\nNext steps:\n' +
        '  1. Save this output to a sealed location (1Password / age-encrypted file)\n' +
        '  2. Login to /admin to approve each merchant before they can publish\n' +
        '  3. Force first-login password change (manual — no UI for this yet)',
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('seed 失敗:', err);
  process.exit(1);
});
