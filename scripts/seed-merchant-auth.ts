/**
 * scripts/seed-merchant-auth.ts — V2 per-merchant auth backfill
 *
 * Why: 0008_v2_merchant_auth.sql only adds schema (email + password_hash columns)
 * and intentionally does not backfill in the migration — we don't want to hardcode
 * bcrypt cost / hash format in SQL. The real hash is produced by this script in the
 * application layer, sharing the same lib as task 103.
 *
 * V2.2.2 hardening:
 *   - --mode flag for dev (single shared password) vs prod (random per-merchant
 *     passwords + suspendedAt set)
 *   - Default mode is prod-random-suspended when NODE_ENV=production; otherwise dev-shared.
 *   - prod mode always prints a warning: "demo merchants are SUSPENDED, run admin approval to
 *     activate" — without admin approval, the storefront stays hidden and login is blocked.
 *   - dev mode unchanged: shared demo1234 password for easy testing.
 *
 * Usage:
 *   # local dev (default) — shared demo1234 password, no suspend
 *   pnpm tsx scripts/seed-merchant-auth.ts
 *
 *   # production — random passwords, all suspended pending admin approval
 *   NODE_ENV=production pnpm tsx scripts/seed-merchant-auth.ts
 *   pnpm tsx scripts/seed-merchant-auth.ts --mode=prod
 *
 *   # dev mode forced even with NODE_ENV=production (escape hatch)
 *   pnpm tsx scripts/seed-merchant-auth.ts --mode=dev
 *
 * Idempotent: merchants that already have an email are skipped, never overwritten.
 *
 * Security notes (from V2.2.2 review):
 *   - Seeding "demo1234" as a shared password into prod is a backdoor (anyone reading docs
 *     can login as any merchant). prod mode switches to random + suspended.
 *   - Passwords printed in prod mode are stdout-only, ephemeral — recommend redirecting to a sealed file:
 *       NODE_ENV=production pnpm tsx scripts/seed-merchant-auth.ts > /tmp/creds.txt
 *       chmod 600 /tmp/creds.txt
 *   - This script uses dbAdmin (BYPASSRLS) to UPDATE merchants directly. Run from console.
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq, isNull } from 'drizzle-orm';

// Must load .env.local before importing @/db — otherwise lazy init can't pick up DATABASE_URL_*
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
 * V2.2.10 / autoplan v2 F19 guard — refuse dev-mode seed against an external DB.
 *
 * Failure mode it prevents: operator runs `pnpm tsx scripts/seed-merchant-auth.ts`
 * with DATABASE_URL_ADMIN pointed at Neon (or any non-local host) but forgets to
 * set NODE_ENV=production / --mode=prod. Defaults to dev mode → seeds shared
 * `demo1234` password to all merchants → public backdoor.
 *
 * Heuristic: if the admin URL host is NOT localhost / 127.0.0.1 / docker host,
 * treat it as external and require explicit `--mode=` (prod or dev — both fine
 * once explicit, this guards against the silent default).
 */
function assertSafeForMode(mode: Mode): void {
  const adminUrl = process.env.DATABASE_URL_ADMIN;
  if (!adminUrl) return; // env zod will catch this elsewhere
  const hostMatch = adminUrl.match(/@([^:/]+)/);
  const host = hostMatch?.[1]?.toLowerCase() ?? '';
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === 'host.docker.internal' ||
    host.endsWith('.local');
  if (isLocal) return;

  const explicitFlag = process.argv.some((a) => a.startsWith('--mode='));
  if (mode === 'dev' && !explicitFlag) {
    throw new Error(
      `Refusing dev-mode seed against non-local DB host (${host}).\n` +
        `Dev mode would set every merchant's password to "demo1234" — a public backdoor.\n` +
        `Either:\n` +
        `  - Set NODE_ENV=production (auto-selects prod mode), or\n` +
        `  - Pass --mode=prod (random per-merchant passwords + suspended), or\n` +
        `  - Pass --mode=dev EXPLICITLY if you really want demo1234 against ${host}.`,
    );
  }
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
  assertSafeForMode(mode);
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
          // Storefront stays hidden + login blocked until an admin manually approves in the dashboard
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
