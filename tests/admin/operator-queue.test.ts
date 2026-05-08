/**
 * V1.6 Track A8 — operator queue (cross-merchant action inbox) test suite
 *
 * 5 cases:
 *   1. Severity ordering: P1 paid_unshipped sorts before P3 no_photo
 *   2. One merchant with 3 signal types → 3 QueueItems (no collapse)
 *   3. All merchants healthy → return [] (EmptyState shows "all merchants in good shape")
 *   4. Suspended merchant fully excluded from queue
 *   5. Cross-tenant isolation: tenant A's signals do not bleed into tenant B's QueueItems
 *
 * UUID naming (avoiding cost-cap cc/dd, rls.e2e 99/aa, demo 11/22, admin-search 88...aaa1/aaa2):
 *   TENANT_C = eeeeeeee-...
 *   TENANT_D = ffffffff-...
 *
 * Uses dbAdmin (admin observability scope, BYPASSRLS legitimate).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAdmin } from '@/db/admin-only';
import {
  merchants,
  products,
  orders,
  type ProductAiMetadata,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getOperatorQueue } from '@/lib/admin/operator-queue';

const TENANT_C = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const TENANT_D = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const TENANT_SUSPENDED = 'eeeeeeee-ffff-eeee-eeee-eeeeeeeeeeee';

const STUB_AI_META: ProductAiMetadata = {
  title: 'stub',
  description: 'stub',
  category: '其他',
  seo_tags: [],
  variants: [],
  price_twd: { min: 0, max: 0 },
  confidence: 0.5,
};

/** Ensure both tenants are clean before/after each test */
async function cleanup() {
  // Order rows reference products via order_items but we never insert order_items here.
  // Delete orders before products to satisfy any FK if added later.
  for (const tid of [TENANT_C, TENANT_D, TENANT_SUSPENDED]) {
    await dbAdmin.delete(orders).where(eq(orders.tenantId, tid));
    await dbAdmin.delete(products).where(eq(products.tenantId, tid));
  }
}

beforeAll(async () => {
  // V1.7 D1: All fixture merchants set approvedAt (= approved), otherwise the newly added
  // pending_approval signal would list these fixtures in the queue → interferes with existing assertions.
  // approveByAdmin = 'fixture' marks them as test data.
  const now = new Date();
  await dbAdmin
    .insert(merchants)
    .values([
      {
        id: TENANT_C,
        slug: 'queue-test-c',
        name: 'Queue Test C',
        approvedAt: now,
        approvedByAdmin: 'fixture',
      },
      {
        id: TENANT_D,
        slug: 'queue-test-d',
        name: 'Queue Test D',
        approvedAt: now,
        approvedByAdmin: 'fixture',
      },
      {
        id: TENANT_SUSPENDED,
        slug: 'queue-test-suspended',
        name: 'Queue Test Suspended',
        suspendedAt: now,
        suspendedReason: 'operator-queue test fixture',
        approvedAt: now,
        approvedByAdmin: 'fixture',
      },
    ])
    .onConflictDoNothing();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await dbAdmin.delete(merchants).where(eq(merchants.id, TENANT_C));
  await dbAdmin.delete(merchants).where(eq(merchants.id, TENANT_D));
  await dbAdmin.delete(merchants).where(eq(merchants.id, TENANT_SUSPENDED));
});

describe('V1.6 A8 — getOperatorQueue', () => {
  it('severity ordering: P1 paid_unshipped 排在 P3 no_photo 前', async () => {
    await cleanup();

    // tenant C: 1 paid order (P1) + 1 no-photo product (P3)
    // stock=50 deliberately above low_stock threshold (5) to avoid simultaneously triggering P3 low_stock
    await dbAdmin.insert(products).values({
      tenantId: TENANT_C,
      title: '商品標題長度足夠避開 short_title',
      description: 'desc',
      r2Key: '', // no_photo
      priceCents: 10000,
      stockQuantity: 50,
      aiMetadata: STUB_AI_META,
    });
    await dbAdmin.insert(orders).values({
      tenantId: TENANT_C,
      customerEmail: 'buyer@example.com',
      totalCents: 10000,
      status: 'paid',
    });

    const queue = await getOperatorQueue();
    const cItems = queue.filter((q) => q.merchantId === TENANT_C);

    expect(cItems.length).toBe(2);

    // P1 must appear before P3 (compared across whole queue; cItems is also a sorted subsequence)
    const p1Idx = queue.findIndex(
      (q) => q.merchantId === TENANT_C && q.signalType === 'paid_unshipped',
    );
    const p3Idx = queue.findIndex(
      (q) => q.merchantId === TENANT_C && q.signalType === 'no_photo',
    );
    expect(p1Idx).toBeGreaterThanOrEqual(0);
    expect(p3Idx).toBeGreaterThan(p1Idx);

    // severity / count / reason correct
    const p1 = queue[p1Idx]!;
    expect(p1.severity).toBe('P1');
    expect(p1.signalType).toBe('paid_unshipped');
    expect(p1.count).toBe(1);
    expect(p1.reason).toContain('已付款待出貨');
    expect(p1.actionHref).toBe(`/admin/merchants/${TENANT_C}?focus=paid_unshipped`);

    const p3 = queue[p3Idx]!;
    expect(p3.severity).toBe('P3');
    expect(p3.signalType).toBe('no_photo');
    expect(p3.count).toBe(1);

    await cleanup();
  });

  it('一個商家 3 種 signal → 出 3 個 QueueItem (不 collapse 成 1)', async () => {
    await cleanup();

    // tenant C: 1 product simultaneously has zero_stock + zero_price + no_photo (3 issues on one product)
    // Expected → 3 QueueItems (per signal-type, no collapse to "1 product, 3 issues")
    await dbAdmin.insert(products).values({
      tenantId: TENANT_C,
      title: '商品標題長度足夠避開 short_title',
      description: 'desc',
      r2Key: '', // no_photo
      priceCents: 0, // zero_price
      stockQuantity: 0, // zero_stock
      aiMetadata: STUB_AI_META,
    });

    const queue = await getOperatorQueue();
    const cItems = queue.filter((q) => q.merchantId === TENANT_C);

    expect(cItems.length).toBe(3);
    const types = cItems.map((q) => q.signalType).sort();
    expect(types).toEqual(['no_photo', 'zero_price', 'zero_stock']);

    // Each count = 1
    for (const it of cItems) {
      expect(it.count).toBe(1);
    }

    // P2 (zero_stock / zero_price) must sort before P3 (no_photo)
    const stockIdx = cItems.findIndex((q) => q.signalType === 'zero_stock');
    const priceIdx = cItems.findIndex((q) => q.signalType === 'zero_price');
    const photoIdx = cItems.findIndex((q) => q.signalType === 'no_photo');
    expect(stockIdx).toBeLessThan(photoIdx);
    expect(priceIdx).toBeLessThan(photoIdx);

    await cleanup();
  });

  it('全部商家健康 (TENANT_C/D 都沒 issue) → queue 不含這兩家', async () => {
    await cleanup();

    // tenant C fully healthy: 1 normal product, no active orders
    await dbAdmin.insert(products).values({
      tenantId: TENANT_C,
      title: '完全正常的商品標題長度',
      description: 'desc',
      r2Key: 'queue/healthy.jpg',
      priceCents: 10000,
      stockQuantity: 50, // above low_stock threshold (5)
      aiMetadata: STUB_AI_META,
    });
    // tenant D: no products, no orders

    const queue = await getOperatorQueue();
    const cItems = queue.filter((q) => q.merchantId === TENANT_C);
    const dItems = queue.filter((q) => q.merchantId === TENANT_D);

    expect(cItems).toEqual([]);
    expect(dItems).toEqual([]);

    await cleanup();
  });

  it('suspended merchant 完全排除 — 即使有 issue 也不出現在 queue', async () => {
    await cleanup();

    // suspended tenant gets a pile of issues: paid order + zero_stock product
    await dbAdmin.insert(products).values({
      tenantId: TENANT_SUSPENDED,
      title: '商品標題長度足夠避開 short_title',
      description: 'desc',
      r2Key: '',
      priceCents: 0,
      stockQuantity: 0,
      aiMetadata: STUB_AI_META,
    });
    await dbAdmin.insert(orders).values({
      tenantId: TENANT_SUSPENDED,
      customerEmail: 'buyer@example.com',
      totalCents: 10000,
      status: 'paid',
    });

    const queue = await getOperatorQueue();
    const suspendedItems = queue.filter((q) => q.merchantId === TENANT_SUSPENDED);

    expect(suspendedItems).toEqual([]);

    await cleanup();
  });

  it('cross-tenant isolation: tenant C signals do NOT bleed into tenant D items', async () => {
    await cleanup();

    // tenant C: paid_unshipped x 2 + zero_stock x 3
    await dbAdmin.insert(products).values([
      {
        tenantId: TENANT_C,
        title: 'C 的零庫存商品 1',
        description: 'desc',
        r2Key: 'c/p1.jpg',
        priceCents: 10000,
        stockQuantity: 0,
        aiMetadata: STUB_AI_META,
      },
      {
        tenantId: TENANT_C,
        title: 'C 的零庫存商品 2',
        description: 'desc',
        r2Key: 'c/p2.jpg',
        priceCents: 10000,
        stockQuantity: 0,
        aiMetadata: STUB_AI_META,
      },
      {
        tenantId: TENANT_C,
        title: 'C 的零庫存商品 3',
        description: 'desc',
        r2Key: 'c/p3.jpg',
        priceCents: 10000,
        stockQuantity: 0,
        aiMetadata: STUB_AI_META,
      },
    ]);
    await dbAdmin.insert(orders).values([
      {
        tenantId: TENANT_C,
        customerEmail: 'buyer-c1@example.com',
        totalCents: 10000,
        status: 'paid',
      },
      {
        tenantId: TENANT_C,
        customerEmail: 'buyer-c2@example.com',
        totalCents: 10000,
        status: 'paid',
      },
    ]);

    // tenant D: only 1 short_title issue (P4)
    await dbAdmin.insert(products).values({
      tenantId: TENANT_D,
      title: '短標', // length=2 < 8 → short_title
      description: 'desc',
      r2Key: 'd/p1.jpg',
      priceCents: 10000,
      stockQuantity: 50,
      aiMetadata: STUB_AI_META,
    });

    const queue = await getOperatorQueue();
    const cItems = queue.filter((q) => q.merchantId === TENANT_C);
    const dItems = queue.filter((q) => q.merchantId === TENANT_D);

    // tenant C: 2 signals (paid_unshipped x 1 entry, count=2; zero_stock x 1 entry, count=3)
    expect(cItems.length).toBe(2);
    const cByType = Object.fromEntries(cItems.map((q) => [q.signalType, q]));
    expect(cByType.paid_unshipped?.count).toBe(2);
    expect(cByType.zero_stock?.count).toBe(3);

    // tenant D: only 1 short_title (P4)
    expect(dItems.length).toBe(1);
    expect(dItems[0]!.signalType).toBe('short_title');
    expect(dItems[0]!.count).toBe(1);
    expect(dItems[0]!.severity).toBe('P4');

    // Should not bleed: D should not have paid_unshipped / zero_stock
    expect(dItems.find((q) => q.signalType === 'paid_unshipped')).toBeUndefined();
    expect(dItems.find((q) => q.signalType === 'zero_stock')).toBeUndefined();
    // Should not bleed: C should not have short_title
    expect(cItems.find((q) => q.signalType === 'short_title')).toBeUndefined();

    await cleanup();
  });
});
