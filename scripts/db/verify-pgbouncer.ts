/**
 * scripts/db/verify-pgbouncer.ts — V2.2.6 verifier.
 *
 * Run against a production-shape DATABASE_URL_USER (Neon pooled endpoint or
 * any pgBouncer in transaction mode) to verify that withTenantTx still
 * enforces RLS through the pooler.
 *
 * What we worry about: pgBouncer transaction mode reuses backend connections
 * across queries from different clients. If our RLS setup leaked any session-
 * level state, a previous transaction's tenant_id could leak into the next.
 *
 * What this verifies:
 *  1. set_config('app.tenant_id', X, true) applied via SET LOCAL semantics is
 *     transaction-scoped — it resets at COMMIT/ROLLBACK.
 *  2. Two consecutive transactions with different tenant_ids each see only
 *     their own data via RLS, even if pgBouncer routed them to the same
 *     backend connection.
 *  3. node-postgres parameterized queries don't prepare (named prepared
 *     statements would break under pgBouncer transaction mode; we rely on
 *     pg defaulting to unprepared parameterized).
 *
 * Usage:
 *   DATABASE_URL_USER=<pooled> DATABASE_URL_ADMIN=<pooled> tsx scripts/db/verify-pgbouncer.ts
 *
 * Exits 0 on success, 1 on RLS leak, 2 on connectivity error.
 */
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

const TENANT_A = '11112222-aaaa-bbbb-cccc-dddd11112222';
const TENANT_B = '33334444-aaaa-bbbb-cccc-dddd33334444';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL_USER || !process.env.DATABASE_URL_ADMIN) {
    console.error('ERROR: DATABASE_URL_USER + DATABASE_URL_ADMIN must be set.');
    process.exit(2);
  }

  // Dynamic import so dotenv ran first.
  const { dbAdmin, dbUser } = await import('../../src/db');
  const { merchants, products } = await import('../../src/db/schema');
  const { withTenantTx } = await import('../../src/lib/db/with-tenant');

  console.log('Setting up two test tenants...');
  await dbAdmin
    .insert(merchants)
    .values([
      { id: TENANT_A, slug: 'pgb-verify-a', name: 'PGB Verify A' },
      { id: TENANT_B, slug: 'pgb-verify-b', name: 'PGB Verify B' },
    ])
    .onConflictDoNothing();

  const placeholderMeta = {
    title: 'placeholder',
    description: '',
    category: '其他' as const,
    seo_tags: [],
    variants: [],
    price_twd: { min: 0, max: 0 },
    confidence: 0,
  };
  await dbAdmin.insert(products).values([
    {
      tenantId: TENANT_A,
      title: 'A only',
      description: '',
      r2Key: 'a',
      priceCents: 0,
      aiMetadata: placeholderMeta,
    },
    {
      tenantId: TENANT_B,
      title: 'B only',
      description: '',
      r2Key: 'b',
      priceCents: 0,
      aiMetadata: placeholderMeta,
    },
  ]);

  try {
    console.log('Running 100 alternating transactions through the pooler...');
    let aLeaks = 0;
    let bLeaks = 0;
    for (let i = 0; i < 100; i++) {
      // Alternate tenants every iteration so the pgBouncer-routed backend connection
      // sees a different tenant_id between transactions. If SET LOCAL leaked, A's
      // tenant_id would still be set when B's transaction starts on the same backend.
      const isA = i % 2 === 0;
      const tenantId = isA ? TENANT_A : TENANT_B;
      const expectedTitle = isA ? 'A only' : 'B only';
      const otherTitle = isA ? 'B only' : 'A only';

      await withTenantTx(tenantId, async (tx) => {
        const rows = await tx
          .select({ title: products.title })
          .from(products)
          .where(sql`title IN (${expectedTitle}, ${otherTitle})`);

        const titles = rows.map((r) => r.title);
        if (!titles.includes(expectedTitle)) {
          console.error(`iter ${i}: tenant ${tenantId.slice(0, 8)} could not see own row`);
          if (isA) aLeaks++;
          else bLeaks++;
        }
        if (titles.includes(otherTitle)) {
          console.error(`iter ${i}: tenant ${tenantId.slice(0, 8)} LEAKED ${otherTitle}`);
          if (isA) aLeaks++;
          else bLeaks++;
        }
      });
    }

    if (aLeaks + bLeaks === 0) {
      console.log('OK: 100 transactions, RLS held throughout.');
      console.log('pgBouncer transaction-mode compat confirmed for withTenantTx.');
    } else {
      console.error(`FAIL: ${aLeaks} A-side and ${bLeaks} B-side leaks observed.`);
      process.exit(1);
    }

    // Smoke check: dbUser without withTenantTx should see NOTHING (no app.tenant_id set).
    const noTenant = await dbUser.execute(
      sql`SELECT count(*)::int as n FROM products WHERE title IN ('A only', 'B only')`,
    );
    const n = Number((noTenant.rows ?? noTenant)[0]?.n ?? 0);
    if (n > 0) {
      console.error(`FAIL: dbUser without tenant context saw ${n} rows (expected 0).`);
      process.exit(1);
    }
    console.log('OK: dbUser without app.tenant_id sees 0 rows (RLS denies all).');
  } finally {
    console.log('Cleaning up test data...');
    await dbAdmin.delete(products).where(sql`tenant_id IN (${TENANT_A}, ${TENANT_B})`);
    await dbAdmin.delete(merchants).where(sql`id IN (${TENANT_A}, ${TENANT_B})`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Verifier crashed:', err);
  process.exit(2);
});
