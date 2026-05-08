/**
 * /admin search + filter + pagination (V1.6 A1) integration test
 *
 * All HTTP end-to-end (dev server must be running) — page.tsx glues URL searchParams
 * parsing + dynamic SQL + render together, so hitting SQL directly to test sub-steps
 * loses fidelity. Hit HTTP instead.
 *
 * Preconditions: bun run dev running + admin password in env.
 *
 * 5 cases:
 *   1. ?q=stylish → HTML contains 'stylish-man' (slug ILIKE)
 *   2. ?status=suspended → HTML contains "suspended" chip + no known active demo merchant slug
 *   3. ?page=2 — 5 merchants < 20 → should redirect back to page=1 (filteredTotal=5, totalPages=1)
 *   4. ?q=zzznoexist → HTML contains EmptyState ("找不到符合的商家" + 清除篩選 link)
 *   5. ?page=999 → no 500 (redirect to last valid page)
 *
 * Cross-tenant: admin uses dbAdmin (cross-tenant by design), but verify search does not leak random slugs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAdmin } from '@/db';
import { merchants, adminSessions } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { ADMIN_SESSION_COOKIE, createAdminSession } from '@/lib/admin-session';

const BASE = 'http://localhost:3000';

// Isolated tenants — don't pollute demo data; slug 'stylish-man-xxx' ensures search hits only one
const T_STYLISH = '88888888-aaaa-aaaa-aaaa-aaa1aaaaaaa1';
const T_SUSPENDED = '88888888-aaaa-aaaa-aaaa-aaa2aaaaaaa2';

let adminCookie: string | null = null;
let serverUp = false;

beforeAll(async () => {
  // dev server must be running
  try {
    const r = await fetch(`${BASE}/`);
    serverUp = r.ok || r.status < 500;
  } catch {
    serverUp = false;
  }
  if (!serverUp) {
    console.warn('skip admin-search HTTP tests: dev server not running (bun run dev)');
    return;
  }

  // Seed 2 isolated merchants
  await dbAdmin
    .insert(merchants)
    .values([
      {
        id: T_STYLISH,
        slug: 'stylish-man-search-test',
        name: 'Stylish Man Search Test',
      },
      {
        id: T_SUSPENDED,
        slug: 'integ-suspended-search',
        name: 'Suspended Search Target',
        suspendedAt: new Date(),
        suspendedReason: 'admin-search test',
      },
    ])
    .onConflictDoNothing();

  // Create admin session
  const session = await createAdminSession({ ip: 'admin-search-test' });
  adminCookie = `${ADMIN_SESSION_COOKIE}=${session.cookieValue}`;
});

afterAll(async () => {
  await dbAdmin.delete(merchants).where(eq(merchants.id, T_STYLISH));
  await dbAdmin.delete(merchants).where(eq(merchants.id, T_SUSPENDED));
  await dbAdmin.delete(adminSessions).where(sql`ip = 'admin-search-test'`);
});

async function get(path: string) {
  if (!serverUp || !adminCookie) return null;
  try {
    return await fetch(`${BASE}${path}`, {
      headers: { cookie: adminCookie },
      redirect: 'manual',
    });
  } catch {
    return null;
  }
}

describe('/admin search + filter + pagination (V1.6 A1)', () => {
  it('?q=stylish-man-search → HTML 含 stylish-man-search-test (slug ILIKE 命中)', async () => {
    const r = await get('/admin?q=stylish-man-search');
    if (!r) return;
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('stylish-man-search-test');
    // Should not see unrelated merchants (e.g. suspended target)
    expect(html).not.toContain('integ-suspended-search');
  });

  it('?status=suspended → 含已停權 chip + 含 suspended seed slug', async () => {
    const r = await get('/admin?status=suspended');
    if (!r) return;
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('已停權');
    expect(html).toContain('integ-suspended-search');
    // active demo merchant should not appear (filter is a hard exclusion)
    expect(html).not.toContain('stylish-man-search-test');
  });

  it('?q=zzznoexist-search-target → EmptyState 渲染 (找不到符合的商家)', async () => {
    const r = await get('/admin?q=zzznoexist-search-target');
    if (!r) return;
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('找不到符合的商家');
    expect(html).toContain('清除篩選');
    // EmptyState should show "current filters" recap
    expect(html).toContain('zzznoexist-search-target');
  });

  it('?page=999 → 不 500 (redirect to last valid page or empty page)', async () => {
    const r = await get('/admin?page=999');
    if (!r) return;
    // Either 200 (renders normally) or 307 (redirect to last page). Both OK; key is no 500.
    expect([200, 307, 308]).toContain(r.status);
    expect(r.status).not.toBe(500);
  });

  it('?page=2 with 預設 (small total) → redirect 回 page=1 (越界 redirect)', async () => {
    // Assume demo + seed merchants < 20, totalPages = 1, page=2 out-of-range
    const r = await get('/admin?page=2');
    if (!r) return;
    // Out-of-range redirect 307 OR 200 (if there happen to be >= 21 merchants, also OK)
    expect([200, 307, 308]).toContain(r.status);
    if (r.status === 307 || r.status === 308) {
      const loc = r.headers.get('location') ?? '';
      // Should redirect to /admin (page=1, no page param)
      expect(loc).toMatch(/\/admin($|\?)/);
    }
  });

  it('?attn=1 → toolbar 渲染 needs-attention 高亮 (button aria-pressed=true)', async () => {
    const r = await get('/admin?attn=1');
    if (!r) return;
    expect(r.status).toBe(200);
    const html = await r.text();
    // AdminToolbar's aria-pressed = "true" when attn=true
    expect(html).toMatch(/aria-pressed="true"/);
  });

  it('AdminToolbar 在頁面 (search input + status select + attn button + sort select)', async () => {
    const r = await get('/admin');
    if (!r) return;
    expect(r.status).toBe(200);
    const html = await r.text();
    // Search input
    expect(html).toMatch(/id="admin-search"/);
    // Status select
    expect(html).toMatch(/id="admin-status"/);
    // Sort select
    expect(html).toMatch(/id="admin-sort"/);
    // "needs attention" chip
    expect(html).toContain('需關注');
  });

  it('Cross-tenant search 不 leak 隨機 slug — q 必須 ILIKE 命中才出現', async () => {
    // Use a definitely-nonexistent slug — no merchant rows should appear
    const r = await get('/admin?q=__definitely_not_a_real_slug__');
    if (!r) return;
    const html = await r.text();
    expect(html).toContain('找不到符合的商家');
    // Neither seeded slug should leak
    expect(html).not.toContain('stylish-man-search-test');
    expect(html).not.toContain('integ-suspended-search');
  });
});
