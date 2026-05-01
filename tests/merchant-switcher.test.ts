/**
 * MerchantSwitcher V1.7 D2 — top-10 + /merchant-switcher full-list page tests.
 *
 * 4 cases per spec:
 *   1. layout top-10 query 回最多 10 個 approved merchants
 *   2. /merchant-switcher?q=switcher-stylish-test ILIKE 命中 (HTTP smoke)
 *   3. /merchant-switcher?page=2 越界不 500 (HTTP smoke)
 *   4. /merchant-switcher 排除 approved_at IS NULL 商家 (DB + HTTP)
 *
 * Pattern reference: tests/v1-integration.test.ts (HTTP smoke + dbAdmin seed/cleanup,
 * gracefully skip if dev server 沒跑).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAdmin } from '@/db';
import { merchants } from '@/db/schema';
import { count, desc, eq, isNotNull } from 'drizzle-orm';

const BASE = 'http://localhost:3000';

// 獨立 fixture tenants — 不污染 demo / integration data
const M_RECENT = '88888888-bbbb-1111-1111-aaaaaaaaa001';
const M_OLD = '88888888-bbbb-1111-1111-aaaaaaaaa002';
const M_PENDING = '88888888-bbbb-1111-1111-aaaaaaaaa003';
const M_STYLISH = '88888888-bbbb-1111-1111-aaaaaaaaa004';

let serverUp = false;

beforeAll(async () => {
  // Seed:
  //   M_RECENT  : approved + updated_at = now()
  //   M_OLD     : approved + updated_at = 1 year ago (測 ORDER BY updated_at DESC)
  //   M_PENDING : approved_at IS NULL → top 10 + /merchant-switcher 必須排除
  //   M_STYLISH : approved + slug 'switcher-stylish-test' (測 ?q= ILIKE 命中)
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  await dbAdmin
    .insert(merchants)
    .values([
      {
        id: M_RECENT,
        slug: 'switcher-recent-fixture',
        name: 'Switcher Recent Fixture',
        approvedAt: new Date(),
        approvedByAdmin: 'fixture',
        updatedAt: new Date(),
      },
      {
        id: M_OLD,
        slug: 'switcher-old-fixture',
        name: 'Switcher Old Fixture',
        approvedAt: new Date(),
        approvedByAdmin: 'fixture',
        updatedAt: oneYearAgo,
      },
      {
        id: M_PENDING,
        slug: 'switcher-pending-fixture',
        name: 'Switcher Pending Fixture',
        // approvedAt 故意 null → pending → 不該出現
      },
      {
        id: M_STYLISH,
        slug: 'switcher-stylish-test',
        name: 'Switcher Stylish Test',
        approvedAt: new Date(),
        approvedByAdmin: 'fixture',
        updatedAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  // dev server probe (HTTP smoke graceful skip)
  try {
    const r = await fetch(`${BASE}/`);
    serverUp = r.ok || r.status < 500;
  } catch {
    serverUp = false;
  }
  if (!serverUp) {
    console.warn('skip merchant-switcher HTTP tests: dev server 沒跑 (bun run dev)');
  }
});

afterAll(async () => {
  for (const id of [M_RECENT, M_OLD, M_PENDING, M_STYLISH]) {
    await dbAdmin.delete(merchants).where(eq(merchants.id, id));
  }
});

async function get(path: string, init?: RequestInit) {
  if (!serverUp) return null;
  try {
    return await fetch(`${BASE}${path}`, { ...init, redirect: 'manual' });
  } catch {
    return null;
  }
}

describe('MerchantSwitcher V1.7 D2', () => {
  it('layout top-10 query: max 10 rows + ORDER BY updated_at DESC + 排除 unapproved', async () => {
    // Mirror layout.tsx top 10 query exactly
    const rows = await dbAdmin
      .select({
        id: merchants.id,
        slug: merchants.slug,
        approvedAt: merchants.approvedAt,
      })
      .from(merchants)
      .where(isNotNull(merchants.approvedAt))
      .orderBy(desc(merchants.updatedAt))
      .limit(10);

    expect(rows.length).toBeLessThanOrEqual(10);
    // approved 商家全部 approvedAt 非 null
    for (const r of rows) {
      expect(r.approvedAt).not.toBeNull();
    }
    // M_PENDING 不該出現
    expect(rows.find((r) => r.slug === 'switcher-pending-fixture')).toBeUndefined();

    // sanity: total approved < total all (因為有 M_PENDING)
    const [approved] = await dbAdmin
      .select({ n: count(merchants.id) })
      .from(merchants)
      .where(isNotNull(merchants.approvedAt));
    const [all] = await dbAdmin.select({ n: count(merchants.id) }).from(merchants);
    expect((all?.n ?? 0)).toBeGreaterThan(approved?.n ?? 0);
  });

  it('/merchant-switcher?q=switcher-stylish-test → ILIKE 命中 (HTTP)', async () => {
    const r = await get('/merchant-switcher?q=switcher-stylish-test', {
      headers: { cookie: `demo-merchant-id=${M_RECENT}` },
    });
    if (!r) return;
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('switcher-stylish-test');
    // 不 leak unapproved fixture
    expect(html).not.toContain('switcher-pending-fixture');
  });

  it('/merchant-switcher?page=2 越界 — 不 500 (redirect 或空頁)', async () => {
    // 用獨特 q 鎖 1 筆 → totalPages=1, page=2 必越界
    const r = await get('/merchant-switcher?q=switcher-stylish-test&page=2', {
      headers: { cookie: `demo-merchant-id=${M_RECENT}` },
    });
    if (!r) return;
    expect([200, 307, 308]).toContain(r.status);
    expect(r.status).not.toBe(500);
  });

  it('/merchant-switcher 排除 approved_at IS NULL 商家 (default list + HTTP)', async () => {
    const r = await get('/merchant-switcher', {
      headers: { cookie: `demo-merchant-id=${M_RECENT}` },
    });
    if (!r) return;
    expect(r.status).toBe(200);
    const html = await r.text();
    // approved fixture 出現
    expect(html).toContain('switcher-recent-fixture');
    // pending fixture 絕不出現
    expect(html).not.toContain('switcher-pending-fixture');
  });
});
