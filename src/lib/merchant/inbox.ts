/**
 * MerchantInbox 資料層 (V1.6 Track B5)
 *
 * 將 V1 #72 PendingCallout (orders 3 signal) + V1.5 B1 HealthCallout (products 4 signal)
 * 合併成一個 inbox model: 7 種 signal type, 嚴重度 P1→P5.
 *
 * 設計決定:
 *   - 一個 withTenantTx (RLS-safe), 內含 2 條 query — products / orders 不同表 (合併不了)
 *     但 N+1 已避免, 全部在同一個 transaction 一次拉完.
 *   - merchants.lowStockThreshold 用同一個 tx 讀 (web_anon 有 SELECT, RLS-safe).
 *   - 嚴重度排序 by P1→P5 asc, 同 severity 內 by count desc.
 *   - count = 0 的 type 不出現在 inbox (preserve V1 hide-when-zero behavior).
 *
 * Pattern after PendingCallout v1 + HealthCallout v1.5: chip family, no scorecard.
 */
import { sql } from 'drizzle-orm';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products, orders, merchants } from '@/db/schema';

/**
 * 7 種 signal type, 對應 7 種 inbox chip:
 *   P1 paid_unshipped     — 已付款待出貨 (revenue blocker, 商家錢卡這)
 *   P2 zero_stock         — 缺貨 (catalog blocker, 顧客沒貨可買)
 *   P2 zero_price         — $0 價格 (catalog blocker, 顧客買不下手)
 *   P3 low_stock          — 低庫存 (≤ merchants.lowStockThreshold, risk)
 *   P3 no_photo           — 缺照片 (含 fixture, risk)
 *   P4 short_title        — 標題太短 < 8 字 (quality)
 *   P5 pending_unpaid     — 未付款訂單 (customer pending, 等顧客)
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
  /** 顯示在 chip 上的中文 label, 例 "3 件商品缺照片" */
  label: string;
  /** 點 chip 跳轉的 filter URL */
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
 * 取得 merchant inbox items (7 signal types 一次拉)
 *
 * 內部 query plan:
 *   1. SELECT lowStockThreshold FROM merchants (RLS-safe via web_anon SELECT grant)
 *   2. COUNT FILTER on products (5 signals: no_photo / short_title / zero_stock / zero_price / low_stock)
 *   3. COUNT FILTER on orders (2 signals: paid_unshipped / pending_unpaid)
 *
 * 三 round-trip 但同一個 tenant tx (set_config 一次), 比 V1.5 的兩個獨立 withTenantTx 省一個 set_config.
 *
 * @param tenantId - merchant.id (UUID), 來自 cookie resolver
 * @returns Inbox items, sorted by severity asc → count desc, count=0 過濾掉
 */
export async function getInboxItems(tenantId: string): Promise<InboxItem[]> {
  const { lowStockThreshold, productRow, orderRow } = await withTenantTx(tenantId, async (tx) => {
    // 1. lowStockThreshold (per-merchant 設定)
    const merchantRows = await tx
      .select({ lowStockThreshold: merchants.lowStockThreshold })
      .from(merchants);
    const threshold = merchantRows[0]?.lowStockThreshold ?? 5;

    // 2. products 5 個 signal (single round-trip, COUNT FILTER)
    //    no_photo: 含 fixture path (跟 list 頁 hasImg hide 條件對齊, V1.5 review M4)
    //    low_stock: stock > 0 AND stock <= threshold (zero_stock 不重複算)
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

    // 3. orders 2 個 signal
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
      // severity asc (P1 first), 同 severity by count desc
      const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return b.count - a.count;
    });
}
