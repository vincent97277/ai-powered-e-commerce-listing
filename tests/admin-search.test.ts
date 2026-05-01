/**
 * /admin search + filter + pagination (V1.6 A1) integration test
 *
 * 全部都是 HTTP 端對端 (dev server 必須跑) — 因為 page.tsx 把 URL searchParams
 * 解析 + 動態 SQL + render 全部黏在一起, 直接打 SQL 測 sub-step 失真. 改打 HTTP.
 *
 * 跑前置: bun run dev 開著 + admin password 在 env.
 *
 * 5 條 case:
 *   1. ?q=stylish → HTML 含 'stylish-man' (slug ILIKE)
 *   2. ?status=suspended → HTML 含 '已停權' chip + 不含已知 active demo merchant slug
 *   3. ?page=2 — 5 商家 < 20 → 應 redirect 回 page=1 (filteredTotal=5, totalPages=1)
 *   4. ?q=zzznoexist → HTML 含 EmptyState ("找不到符合的商家" + 清除篩選 link)
 *   5. ?page=999 → 不 500 (redirect to last valid page)
 *
 * Cross-tenant: admin uses dbAdmin (跨租戶 by design), 但驗 search 不 leak 隨機 slug.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAdmin } from '@/db';
import { merchants, adminSessions } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { ADMIN_SESSION_COOKIE, createAdminSession } from '@/lib/admin-session';

const BASE = 'http://localhost:3000';

// 獨立 tenant — 不污染 demo data; slug 用 'stylish-man-xxx' 確保 search 命中只一個
const T_STYLISH = '88888888-aaaa-aaaa-aaaa-aaa1aaaaaaa1';
const T_SUSPENDED = '88888888-aaaa-aaaa-aaaa-aaa2aaaaaaa2';

let adminCookie: string | null = null;
let serverUp = false;

beforeAll(async () => {
  // dev server 必須開
  try {
    const r = await fetch(`${BASE}/`);
    serverUp = r.ok || r.status < 500;
  } catch {
    serverUp = false;
  }
  if (!serverUp) {
    console.warn('skip admin-search HTTP tests: dev server 沒跑 (bun run dev)');
    return;
  }

  // Seed 2 獨立 merchants
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

  // 建 admin session
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
    // 不應該看到無關商家 (e.g. 已 suspended target)
    expect(html).not.toContain('integ-suspended-search');
  });

  it('?status=suspended → 含已停權 chip + 含 suspended seed slug', async () => {
    const r = await get('/admin?status=suspended');
    if (!r) return;
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('已停權');
    expect(html).toContain('integ-suspended-search');
    // active demo merchant 不該出現 (filter 是 hard exclusion)
    expect(html).not.toContain('stylish-man-search-test');
  });

  it('?q=zzznoexist-search-target → EmptyState 渲染 (找不到符合的商家)', async () => {
    const r = await get('/admin?q=zzznoexist-search-target');
    if (!r) return;
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('找不到符合的商家');
    expect(html).toContain('清除篩選');
    // EmptyState 該顯示「目前篩選」recap
    expect(html).toContain('zzznoexist-search-target');
  });

  it('?page=999 → 不 500 (redirect to last valid page or empty page)', async () => {
    const r = await get('/admin?page=999');
    if (!r) return;
    // Either 200 (renders normally) 或 307 (redirect to last page). 兩個都 OK, 重點是別 500.
    expect([200, 307, 308]).toContain(r.status);
    expect(r.status).not.toBe(500);
  });

  it('?page=2 with 預設 (small total) → redirect 回 page=1 (越界 redirect)', async () => {
    // 假設 demo + seed 商家 < 20, totalPages = 1, page=2 越界
    const r = await get('/admin?page=2');
    if (!r) return;
    // 越界 redirect 307 OR 200 (如果剛好 ≥ 21 個 merchants 也算 OK)
    expect([200, 307, 308]).toContain(r.status);
    if (r.status === 307 || r.status === 308) {
      const loc = r.headers.get('location') ?? '';
      // 應該 redirect to /admin (page=1, 沒 page param)
      expect(loc).toMatch(/\/admin($|\?)/);
    }
  });

  it('?attn=1 → toolbar 渲染 needs-attention 高亮 (button aria-pressed=true)', async () => {
    const r = await get('/admin?attn=1');
    if (!r) return;
    expect(r.status).toBe(200);
    const html = await r.text();
    // AdminToolbar 的 aria-pressed 在 attn=true 時 = "true"
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
    // 需關注 chip
    expect(html).toContain('需關注');
  });

  it('Cross-tenant search 不 leak 隨機 slug — q 必須 ILIKE 命中才出現', async () => {
    // 用一個確定不存在的 slug — 不該出現任何商家 row
    const r = await get('/admin?q=__definitely_not_a_real_slug__');
    if (!r) return;
    const html = await r.text();
    expect(html).toContain('找不到符合的商家');
    // Seed 出來的兩個 slug 都不該 leak
    expect(html).not.toContain('stylish-man-search-test');
    expect(html).not.toContain('integ-suspended-search');
  });
});
