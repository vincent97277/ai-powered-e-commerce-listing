/**
 * scripts/seed-merchant-auth.ts — V2 per-merchant auth backfill
 *
 * Why: 0008_v2_merchant_auth.sql 只加 schema (email + password_hash columns),
 * 沒在 migration 內 backfill — 我們不想把 bcrypt cost / hash 格式寫死在 SQL.
 * 真正的 hash 由這支 script 在 application layer 產, 跟 task 103 用同一個 lib.
 *
 * 行為:
 *   - 列出所有 email IS NULL 的 merchants
 *   - 給每個 merchant 設 email = "{slug}@demo.local", password = "demo1234"
 *   - 用 bcryptjs cost=10 hash 後寫回
 *   - 印出 (slug, email, plaintext password) 讓 user 可以拿去 login UI 測
 *
 * 用法:
 *   set -a; source .env.local; set +a
 *   bunx tsx scripts/seed-merchant-auth.ts
 *   # 或 pnpm tsx ...
 *
 * Idempotent: 已經有 email 的 merchant 跳過, 不會覆蓋.
 *
 * 安全注意:
 *   - "demo1234" 是 dev / staging only — 真 production 應該強迫 email reset flow.
 *   - 此 script 用 dbAdmin (BYPASSRLS) 直接 UPDATE merchants, 因為 V1 沒有 merchant
 *     auth, 沒人可以從 web 跑這個 query.
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { eq, isNull } from 'drizzle-orm';

// 必須在 import @/db 之前 load .env.local — 否則 lazy init 抓不到 DATABASE_URL_*
config({ path: resolve(process.cwd(), '.env.local') });

// eslint-disable-next-line @typescript-eslint/no-require-imports
async function main() {
  // dynamic import 確保 dotenv load 後才 init pg pool
  const { dbAdmin } = await import('../src/db/admin-only');
  const { merchants } = await import('../src/db/schema');

  const DEFAULT_PASSWORD = 'demo1234';
  const BCRYPT_COST = 10;

  // 撈所有還沒 email 的 merchants
  const rows = await dbAdmin
    .select({ id: merchants.id, slug: merchants.slug, name: merchants.name })
    .from(merchants)
    .where(isNull(merchants.email));

  if (rows.length === 0) {
    console.log('沒有 merchant 需要 backfill — 全部已經有 email 了.');
    return;
  }

  console.log(`即將 backfill ${rows.length} 個 merchant 的 email + password_hash...\n`);

  // 同一個 plaintext password → 共用一個 hash 即可 (省時間), 但 bcrypt 每次 salt 不同
  // 所以還是逐筆 hash, cost=10 7 筆大約 1 秒.
  const results: Array<{ slug: string; email: string; password: string }> = [];

  for (const row of rows) {
    const email = `${row.slug}@demo.local`;
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_COST);

    await dbAdmin
      .update(merchants)
      .set({ email, passwordHash })
      .where(eq(merchants.id, row.id));

    results.push({ slug: row.slug, email, password: DEFAULT_PASSWORD });
  }

  // 印出 credentials table 給人類讀
  console.log('成功 backfill. 以下是 demo merchant 登入帳密:\n');
  console.log('| slug                  | email                                | password |');
  console.log('|-----------------------|--------------------------------------|----------|');
  for (const r of results) {
    console.log(
      `| ${r.slug.padEnd(21)} | ${r.email.padEnd(36)} | ${r.password.padEnd(8)} |`,
    );
  }
  console.log('\n(全部 password 都是 "demo1234" — 純 dev/staging seed, 不是 prod credential)');

  // 主動關 pool 讓 process exit
  process.exit(0);
}

main().catch((err) => {
  console.error('seed 失敗:', err);
  process.exit(1);
});
