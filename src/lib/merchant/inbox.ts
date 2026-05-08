/**
 * MerchantInbox data layer (V1.6 Track B5)
 *
 * Merges V1 #72 PendingCallout (3 order signals) + V1.5 B1 HealthCallout (4 product signals)
 * into one inbox model: 7 signal types, severity P1→P5.
 *
 * Design decisions:
 *   - One withTenantTx (RLS-safe), containing 2 queries — products / orders are different tables (can't merge),
 *     but N+1 is avoided, everything fetched in one transaction.
 *   - merchants.lowStockThreshold read in the same tx (web_anon has SELECT, RLS-safe).
 *   - Severity sorted P1→P5 asc, within same severity by count desc.
 *   - Types with count = 0 don't appear in inbox (preserve V1 hide-when-zero behavior).
 *
 * Pattern after PendingCallout v1 + HealthCallout v1.5: chip family, no scorecard.
 */
import { sql } from 'drizzle-orm';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products, orders, merchants } from '@/db/schema';

/**
 * 7 signal types, corresponding to 7 inbox chips:
 *   P1 paid_unshipped     — paid pending shipment (revenue blocker, merchant's revenue stuck)
 *   P2 zero_stock         — out of stock (catalog blocker, no inventory for customers)
 *   P2 zero_price         — $0 price (catalog blocker, customers can't buy)
 *   P3 low_stock          — low stock (≤ merchants.lowStockThreshold, risk)
 *   P3 no_photo           — missing photo (includes fixture, risk)
 *   P4 short_title        — title too short < 8 chars (quality)
 *   P5 pending_unpaid     — unpaid order (customer pending, waiting on customer)
 */
export type InboxSignalType =
  | 'paid_unshipped'
  | 'zero_stock'
  | 'zero_price'
  | 'low_stock'
  | 'no_photo'
  | 'short_title'
  | 'pending_unpaid';

export type InboxSeverity = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export type InboxItem = {
  type: InboxSignalType;
  severity: InboxSeverity;
  count: number;
  /** Chinese label shown on the chip, e.g. "3 件商品缺照片" */
  label: string;
  /** Filter URL the chip links to */
  filterUrl: string;
};

const SEVERITY: Record<InboxSignalType, InboxSeverity> = {
  paid_unshipped: 'P1',
  zero_stock: 'P2',
  zero_price: 'P2',
  low_stock: 'P3',
  no_photo: 'P3',
  short_title: 'P4',
  pending_unpaid: 'P5',
};

const SEVERITY_RANK: Record<InboxSeverity, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
  P5: 5,
};

const FILTER_URL: Record<InboxSignalType, string> = {
  paid_unshipped: '/merchant/orders?status=paid',
  pending_unpaid: '/merchant/orders?status=pending',
  zero_stock: '/merchant/products?filter=zero_stock',
  zero_price: '/merchant/products?filter=zero_price',
  low_stock: '/merchant/products?filter=low-stock',
  no_photo: '/merchant/products?filter=no_photo',
  short_title: '/merchant/products?filter=short_title',
};

function labelFor(type: InboxSignalType, count: number, lowStockThreshold: number): string {
  switch (type) {
    case 'paid_unshipped':
      return `${count} 筆待出貨`;
    case 'pending_unpaid':
      return `${count} 筆待付款`;
    case 'zero_stock':
      return `${count} 件缺貨`;
    case 'zero_price':
      return `${count} 件未定價`;
    case 'low_stock':
      return `${count} 件低庫存 (≤${lowStockThreshold})`;
    case 'no_photo':
      return `${count} 件商品缺照片`;
    case 'short_title':
      return `${count} 件標題太短 (<8 字)`;
  }
}

/**
 * Get merchant inbox items (7 signal types in one shot)
 *
 * Internal query plan:
 *   1. SELECT lowStockThreshold FROM merchants (RLS-safe via web_anon SELECT grant)
 *   2. COUNT FILTER on products (5 signals: no_photo / short_title / zero_stock / zero_price / low_stock)
 *   3. COUNT FILTER on orders (2 signals: paid_unshipped / pending_unpaid)
 *
 * Three round-trips but one tenant tx (one set_config), saves one set_config vs V1.5's two
 * independent withTenantTx calls.
 *
 * @param tenantId - merchant.id (UUID), from cookie resolver
 * @returns Inbox items, sorted by severity asc → count desc, count=0 filtered out
 */
export async function getInboxItems(tenantId: string): Promise<InboxItem[]> {
  const { lowStockThreshold, productRow, orderRow } = await withTenantTx(tenantId, async (tx) => {
    // 1. lowStockThreshold (per-merchant setting)
    const merchantRows = await tx
      .select({ lowStockThreshold: merchants.lowStockThreshold })
      .from(merchants);
    const threshold = merchantRows[0]?.lowStockThreshold ?? 5;

    // 2. products 5 signals (single round-trip, COUNT FILTER)
    //    no_photo: includes fixture path (aligned with the hasImg hide condition on the list page, V1.5 review M4)
    //    low_stock: stock > 0 AND stock <= threshold (doesn't double-count zero_stock)
    const productRows = await tx
      .select({
        noPhoto: sql<number>`count(*) filter (where ${products.r2Key} IS NULL OR ${products.r2Key} = '' OR ${products.r2Key} LIKE '%/fixtures/%')::int`.mapWith(
          Number,
        ),
        shortTitle: sql<number>`count(*) filter (where length(${products.title}) < 8)::int`.mapWith(
          Number,
        ),
        zeroStock: sql<number>`count(*) filter (where ${products.stockQuantity} = 0)::int`.mapWith(
          Number,
        ),
        zeroPrice: sql<number>`count(*) filter (where ${products.priceCents} = 0 OR ${products.priceCents} IS NULL)::int`.mapWith(
          Number,
        ),
        lowStock: sql<number>`count(*) filter (where ${products.stockQuantity} > 0 AND ${products.stockQuantity} <= ${threshold})::int`.mapWith(
          Number,
        ),
      })
      .from(products);

    // 3. orders 2 signals
    const orderRows = await tx
      .select({
        paidUnshipped: sql<number>`count(*) filter (where ${orders.status} = 'paid')::int`.mapWith(
          Number,
        ),
        pendingUnpaid: sql<number>`count(*) filter (where ${orders.status} = 'pending')::int`.mapWith(
          Number,
        ),
      })
      .from(orders);

    return {
      lowStockThreshold: threshold,
      productRow: productRows[0],
      orderRow: orderRows[0],
    };
  });

  const counts: Array<{ type: InboxSignalType; count: number }> = [
    { type: 'paid_unshipped', count: orderRow?.paidUnshipped ?? 0 },
    { type: 'zero_stock', count: productRow?.zeroStock ?? 0 },
    { type: 'zero_price', count: productRow?.zeroPrice ?? 0 },
    { type: 'low_stock', count: productRow?.lowStock ?? 0 },
    { type: 'no_photo', count: productRow?.noPhoto ?? 0 },
    { type: 'short_title', count: productRow?.shortTitle ?? 0 },
    { type: 'pending_unpaid', count: orderRow?.pendingUnpaid ?? 0 },
  ];

  return counts
    .filter((c) => c.count > 0)
    .map<InboxItem>((c) => ({
      type: c.type,
      severity: SEVERITY[c.type],
      count: c.count,
      label: labelFor(c.type, c.count, lowStockThreshold),
      filterUrl: FILTER_URL[c.type],
    }))
    .sort((a, b) => {
      // severity asc (P1 first), within same severity by count desc
      const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return b.count - a.count;
    });
}
