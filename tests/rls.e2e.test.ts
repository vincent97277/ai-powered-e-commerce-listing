/**
 * RLS e2e test — 驗證 multi-tenant 隔離真的 work
 * 對應 engineering-handoff-specs §1.2 + Task #B6
 *
 * 跑法: pnpm vitest run tests/rls.e2e.test.ts
 *
 * 前置條件:
 * - Neon DB 已建好兩條 connection (DATABASE_URL_USER + DATABASE_URL_ADMIN)
 * - Migration 0000 + 0001 都已跑
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbAdmin, dbUser } from '@/db';
import { merchants, products } from '@/db/schema';
import { sql, eq } from 'drizzle-orm';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

beforeAll(async () => {
  // 用 dbAdmin (BYPASSRLS) seed 兩個 tenant + 一筆 product 各自
  await dbAdmin
    .insert(merchants)
    .values([
      { id: TENANT_A, slug: 'shop-a-test', name: 'Shop A (test)' },
      { id: TENANT_B, slug: 'shop-b-test', name: 'Shop B (test)' },
    ])
    .onConflictDoNothing();

  await dbAdmin
    .insert(products)
    .values([
      {
        tenantId: TENANT_A,
        title: 'A-item',
        description: 'A 的商品',
        r2Key: 'test/a.jpg',
        aiMetadata: {
          title: 'A-item',
          description: 'A 的商品',
          category: '其他',
          seo_tags: ['test'],
          variants: [],
          price_twd: { min: 100, max: 200 },
          confidence: 0.9,
        },
      },
      {
        tenantId: TENANT_B,
        title: 'B-item',
        description: 'B 的商品',
        r2Key: 'test/b.jpg',
        aiMetadata: {
          title: 'B-item',
          description: 'B 的商品',
          category: '其他',
          seo_tags: ['test'],
          variants: [],
          price_twd: { min: 100, max: 200 },
          confidence: 0.9,
        },
      },
    ])
    .onConflictDoNothing();
});

afterAll(async () => {
  // Cleanup
  await dbAdmin.delete(products).where(eq(products.tenantId, TENANT_A));
  await dbAdmin.delete(products).where(eq(products.tenantId, TENANT_B));
  await dbAdmin.delete(merchants).where(eq(merchants.id, TENANT_A));
  await dbAdmin.delete(merchants).where(eq(merchants.id, TENANT_B));
});

describe('RLS multi-tenant isolation', () => {
  /**
   * T1: 沒設 tenant context (web_anon role) → 業務表回 0 rows
   * 這是 fail-closed 驗證 — RLS policy 比對 NULL → 條件 false → 沒結果
   */
  it('T1: missing tenant context returns zero rows', async () => {
    const rows = await dbUser.execute(sql`SELECT * FROM products`);
    expect(rows.rows.length).toBe(0);
  });

  /**
   * T2: 設 tenant A 的 id → 看得到 A 的，看不到 B 的
   * 同時驗證 INSERT 別人 tenant_id 會被 WITH CHECK 擋下
   */
  it('T2: tenant A cannot read tenant B rows + WITH CHECK blocks cross-tenant insert', async () => {
    const result = await dbUser.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`);
      return await tx.execute(sql`SELECT title FROM products`);
    });
    const titles = result.rows.map((r: any) => r.title);
    expect(titles).toContain('A-item');
    expect(titles).not.toContain('B-item');

    // WITH CHECK：嘗試插 tenant B 的資料但 context 是 A → 應該被拒
    await expect(
      dbUser.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`);
        await tx.execute(sql`
          INSERT INTO products (tenant_id, title, description, r2_key, ai_metadata)
          VALUES (
            ${TENANT_B}::uuid,
            'evil',
            'cross tenant attempt',
            'test/evil.jpg',
            '{}'::jsonb
          )
        `);
      })
    ).rejects.toThrow(/row-level security/i);
  });

  /**
   * T3: web_anon 無法升權繞過 RLS
   * - SET ROLE platform_admin 應失敗 (沒被 GRANT)
   * - SET SESSION AUTHORIZATION postgres 應失敗 (非 superuser)
   * - 確認當前 connection 沒掛 BYPASSRLS attribute
   */
  it('T3: web_anon cannot escalate to bypass RLS', async () => {
    await expect(dbUser.execute(sql`SET ROLE platform_admin`)).rejects.toThrow(
      /permission denied|must be member/i
    );

    await expect(dbUser.execute(sql`SET SESSION AUTHORIZATION postgres`)).rejects.toThrow();

    const r = await dbUser.execute(sql`
      SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user
    `);
    expect((r.rows[0] as { rolbypassrls?: boolean }).rolbypassrls).toBe(false);
  });
});
