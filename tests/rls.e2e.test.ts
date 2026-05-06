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
import {
  merchants,
  products,
  orders,
  orderStatusHistory,
  importSessions,
  aiUsageEvents,
} from '@/db/schema';
import { sql, eq } from 'drizzle-orm';
import { expectRejectsMatching } from './_helpers/db-error';

// 用 99..., aa... 避免跟 demo merchant (11..., 22...) 撞
const TENANT_A = '99999999-9999-9999-9999-999999999999';
const TENANT_B = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

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
  // Cleanup (cascade 帶走 orders / order_status_history / import_sessions)
  await dbAdmin.delete(products).where(eq(products.tenantId, TENANT_A));
  await dbAdmin.delete(products).where(eq(products.tenantId, TENANT_B));
  await dbAdmin.delete(orders).where(eq(orders.tenantId, TENANT_A));
  await dbAdmin.delete(orders).where(eq(orders.tenantId, TENANT_B));
  await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_A));
  await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_B));
  await dbAdmin.delete(aiUsageEvents).where(eq(aiUsageEvents.tenantId, TENANT_A));
  await dbAdmin.delete(aiUsageEvents).where(eq(aiUsageEvents.tenantId, TENANT_B));
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
    await expectRejectsMatching(
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
      }),
      /row-level security/i,
    );
  });

  /**
   * T3: web_anon 無法升權繞過 RLS
   * - SET ROLE platform_admin 應失敗 (沒被 GRANT)
   * - SET SESSION AUTHORIZATION postgres 應失敗 (非 superuser)
   * - 確認當前 connection 沒掛 BYPASSRLS attribute
   */
  it('T3: web_anon cannot escalate to bypass RLS', async () => {
    // 嘗試切到 BYPASSRLS role 應失敗 (web_anon 沒被 GRANT 到 web_admin)
    await expectRejectsMatching(
      dbUser.execute(sql`SET ROLE web_admin`),
      /permission denied|must be member|does not exist|不存在/i,
    );

    // CLAUDE.md hard-rule #7: drizzle 0.45 wraps errors; .rejects.toThrow()
    // would only check the templated query message, not the postgres
    // permission text on .cause. Pattern mirrors the SET ROLE assertion
    // above — CI envs may report "role does not exist" instead of
    // "permission denied" depending on whether the postgres role is
    // provisioned.
    await expectRejectsMatching(
      dbUser.execute(sql`SET SESSION AUTHORIZATION postgres`),
      /permission denied|insufficient|cannot|denied|must be superuser|does not exist|不存在/i,
    );

    const r = await dbUser.execute(sql`
      SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user
    `);
    expect((r.rows[0] as { rolbypassrls?: boolean }).rolbypassrls).toBe(false);
  });

  /**
   * V1 #73 / RA7: order_status_history RLS via JOIN
   * 商家 A 寫一筆 history → 商家 B 看不到
   */
  it('T4: order_status_history isolation via JOIN orders', async () => {
    // 用 dbAdmin seed 一個 A 的 order + history row
    const orderA = '11111111-2222-3333-4444-555555555555';
    await dbAdmin.delete(orders).where(eq(orders.id, orderA));
    await dbAdmin.insert(orders).values({
      id: orderA,
      tenantId: TENANT_A,
      customerEmail: 'a@test',
      totalCents: 100,
      status: 'paid',
    });
    await dbAdmin.insert(orderStatusHistory).values({
      orderId: orderA,
      fromStatus: 'pending',
      toStatus: 'paid',
      changedBy: 'merchant',
    });

    // 商家 A 看得到
    const seenByA = await dbUser.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`);
      return await tx.execute(sql`SELECT count(*)::int AS n FROM order_status_history`);
    });
    expect(Number((seenByA.rows[0] as { n: number }).n)).toBeGreaterThanOrEqual(1);

    // 商家 B 看不到
    const seenByB = await dbUser.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_B}, true)`);
      return await tx.execute(sql`SELECT count(*)::int AS n FROM order_status_history`);
    });
    expect(Number((seenByB.rows[0] as { n: number }).n)).toBe(0);
  });

  /**
   * V1 #73 / RA7: order_status_history WITH CHECK 拒跨 tenant insert
   * 商家 A 試 insert history 指向 B 的 order → 拒
   */
  it('T5: order_status_history WITH CHECK blocks cross-tenant insert', async () => {
    // 先建一個 B 的 order
    const orderB = 'bbbbbbbb-1111-2222-3333-444444444444';
    await dbAdmin.delete(orders).where(eq(orders.id, orderB));
    await dbAdmin.insert(orders).values({
      id: orderB,
      tenantId: TENANT_B,
      customerEmail: 'b@test',
      totalCents: 100,
      status: 'paid',
    });

    await expectRejectsMatching(
      dbUser.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`);
        // 商家 A 試圖寫一筆 history 指向 B 的 order
        await tx.execute(sql`
          INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
          VALUES (${orderB}::uuid, 'pending', 'paid', 'merchant')
        `);
      }),
      /row-level security/i,
    );
  });

  /**
   * V1 #73 / RA18: import_sessions isolation (RLS via merchant_id 直接比對)
   */
  it('T6: import_sessions isolation', async () => {
    // 商家 A 建 session
    await dbAdmin
      .insert(importSessions)
      .values({
        merchantId: TENANT_A,
        sourceUrl: 'https://www.instagram.com/test_a',
        sourceType: 'ig',
      });

    const seenByA = await dbUser.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`);
      return await tx.execute(sql`SELECT count(*)::int AS n FROM import_sessions`);
    });
    expect(Number((seenByA.rows[0] as { n: number }).n)).toBeGreaterThanOrEqual(1);

    const seenByB = await dbUser.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_B}, true)`);
      return await tx.execute(sql`SELECT count(*)::int AS n FROM import_sessions`);
    });
    expect(Number((seenByB.rows[0] as { n: number }).n)).toBe(0);
  });

  /**
   * V1 #73: import_sessions WITH CHECK 拒商家 A 寫 B 的 session
   */
  it('T7: import_sessions WITH CHECK blocks cross-tenant insert', async () => {
    await expectRejectsMatching(
      dbUser.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`);
        await tx.execute(sql`
          INSERT INTO import_sessions (merchant_id, source_url, source_type)
          VALUES (${TENANT_B}::uuid, 'https://shopee.tw/x', 'shopee')
        `);
      }),
      /row-level security/i,
    );
  });

  /**
   * V1 #73: admin_action_history 對 web_anon 全 deny (defense-in-depth)
   * 即使 set tenant context 也讀不到 (RA2 enforcement)
   */
  it('T8: admin_action_history deny-all to web_anon', async () => {
    await expectRejectsMatching(
      dbUser.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`);
        await tx.execute(sql`SELECT * FROM admin_action_history`);
      }),
      /permission denied|insufficient/i,
    );
  });

  /**
   * V2.6 T9: ai_usage_events RLS — close coverage gap flagged by Codex Eng review.
   *
   * 0006_ai_usage_events.sql declares ENABLE/FORCE RLS + WITH CHECK on the
   * tenant_isolation policy, but no test pinned the behavior. Without a
   * test, a future migration that drops the policy or weakens the WITH
   * CHECK would silently let the AI cost dashboard cross-tenant — and
   * cost-cap math would diverge from per-merchant truth.
   *
   * Three pins:
   *   1. tenant A reads only its own rows
   *   2. tenant A cannot read tenant B rows even with set_config to A
   *   3. WITH CHECK blocks tenant A from inserting a row stamped with B's id
   */
  it('T9: ai_usage_events tenant isolation + WITH CHECK blocks cross-tenant insert', async () => {
    // Seed: 2 events, one per tenant, via dbAdmin (BYPASSRLS).
    await dbAdmin.insert(aiUsageEvents).values([
      { tenantId: TENANT_A, tokensIn: 100, tokensOut: 50, source: 'photo_upload' },
      { tenantId: TENANT_B, tokensIn: 200, tokensOut: 80, source: 'photo_upload' },
    ]);

    // Pin 1 + 2: tenant A only sees its own rows.
    const aRows = await dbUser.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`);
      return await tx.execute(sql`SELECT tenant_id, tokens_in FROM ai_usage_events`);
    });
    const aTenants = aRows.rows.map((r: any) => r.tenant_id);
    expect(aTenants).toContain(TENANT_A);
    expect(aTenants).not.toContain(TENANT_B);

    // Pin 3: WITH CHECK rejects cross-tenant insert (context A, row tenant B).
    await expectRejectsMatching(
      dbUser.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`);
        await tx.execute(sql`
          INSERT INTO ai_usage_events (tenant_id, tokens_in, tokens_out, source)
          VALUES (${TENANT_B}::uuid, 999, 999, 'photo_upload')
        `);
      }),
      /row-level security/i,
    );
  });
});
