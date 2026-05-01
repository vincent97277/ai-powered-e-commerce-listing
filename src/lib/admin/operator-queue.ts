/**
 * Cross-merchant operator queue (V1.6 Track A8)
 *
 * Admin 視角: 「哪些商家需要介入 + 為什麼」.
 * `/admin/queue` page 直接吃這個 helper 回的 QueueItem[].
 *
 * 跟 src/lib/merchant/health-checks.ts 的差異:
 *   - health-checks: per-tenant, 用 withTenantTx (RLS-safe), 商家自己看自家
 *   - operator-queue: cross-tenant, 用 dbAdmin (BYPASSRLS), admin 看全平台
 *   - 多 2 個 order signal (paid_unshipped / pending_unpaid) 是 health-checks 沒有的
 *
 * 為什麼 ONE compound CTE (Codex Eng E3 finding):
 *   - 5 商家 × (4 product signals + 2 order signals) = 30 round-trip 在 naive 寫法
 *   - 1000 商家就會炸. 用 GROUP BY tenant_id + LEFT JOIN merchants 一次 round-trip 拿全部
 *   - COUNT(*) FILTER (WHERE ...) 在 Postgres 是 single-pass aggregate, 比 6 個 sub-query 快
 *
 * 嚴重度規則寫死 (V1.6, V2 可促升 schema):
 *   - P1 paid_unshipped     已付款待出貨 (revenue blocker, customer 在等)
 *   - P2 zero_stock         商品零庫存 (catalog blocker)
 *   - P2 zero_price         商品 $0 價格 (catalog blocker)
 *   - P3 low_stock          商品低庫存 (預警, 跟 V1 schema lowStockThreshold default=5 對齊)
 *   - P3 no_photo           商品缺照片 (跟 health-checks 同條件: NULL/空/fixtures path)
 *   - P4 short_title        商品標題短 (<8 字, 跟 health-checks 同 threshold)
 *   - P5 pending_unpaid     訂單未付款 (customer 自己沒付, merchant 能做的有限)
 *
 * 排序: severity asc (P1 first), 同 severity 內 count desc.
 *
 * Suspended merchant 排除 — admin 對 suspended merchant 不該再被 nudge 介入.
 */
import { sql } from 'drizzle-orm';
import { dbAdmin } from '@/db/admin-only';

export type Severity = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export type SignalType =
  | 'paid_unshipped'   // P1 已付款待出貨
  | 'zero_stock'       // P2 商品零庫存
  | 'zero_price'       // P2 商品 $0 價格
  | 'low_stock'        // P3 商品低庫存
  | 'no_photo'         // P3 商品缺照片
  | 'short_title'      // P4 商品標題短
  | 'pending_unpaid';  // P5 訂單未付款

export type QueueItem = {
  merchantId: string;
  slug: string;
  name: string;
  severity: Severity;
  signalType: SignalType;
  /** 幾個 product / order */
  count: number;
  /** 顯示給 admin 的人話 */
  reason: string;
  /** 跳轉到 /admin/merchants/[id]?focus=... */
  actionHref: string;
};

/* ─────────────────────────── Severity / Reason / Href map ─────────────────────────── */

const SEVERITY_ORDER: Record<Severity, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
  P5: 5,
};

const SIGNAL_META: Record<
  SignalType,
  { severity: Severity; reason: (n: number) => string }
> = {
  paid_unshipped: {
    severity: 'P1',
    reason: (n) => `已付款待出貨 · ${n} 筆`,
  },
  zero_stock: {
    severity: 'P2',
    reason: (n) => `商品零庫存 · ${n} 件`,
  },
  zero_price: {
    severity: 'P2',
    reason: (n) => `商品未定價 · ${n} 件`,
  },
  low_stock: {
    severity: 'P3',
    reason: (n) => `商品低庫存 (≤5) · ${n} 件`,
  },
  no_photo: {
    severity: 'P3',
    reason: (n) => `商品缺照片 · ${n} 件`,
  },
  short_title: {
    severity: 'P4',
    reason: (n) => `商品標題太短 (<8 字) · ${n} 件`,
  },
  pending_unpaid: {
    severity: 'P5',
    reason: (n) => `訂單未付款 · ${n} 筆`,
  },
};

function buildActionHref(merchantId: string, signalType: SignalType): string {
  // Don't touch /admin/merchants/[id] page — focus= is an UI hint the page can ignore safely.
  return `/admin/merchants/${merchantId}?focus=${signalType}`;
}

/* ─────────────────────────── Compound query row ─────────────────────────── */

type AggRow = {
  id: string;
  slug: string;
  name: string;
  no_photo: string | number;
  short_title: string | number;
  zero_stock: string | number;
  zero_price: string | number;
  low_stock: string | number;
  paid_unshipped: string | number;
  pending_unpaid: string | number;
};

/* ─────────────────────────── getOperatorQueue ─────────────────────────── */

/**
 * ONE compound query (Codex Eng E3): merchants LEFT JOIN product_signals LEFT JOIN order_signals.
 *
 * Postgres 規劃:
 *   - product_signals CTE: 一次 GROUP BY tenant_id, COUNT FILTER 5 個 condition
 *     用 idx products(tenant_id) — schema.ts:117 已建
 *   - order_signals CTE:   一次 GROUP BY tenant_id, COUNT FILTER 2 個 status
 *     用 idx orders(tenant_id, status, created_at) — schema.ts:175 已建
 *   - merchants 主 query: LEFT JOIN 兩個 CTE on tenant_id
 *     用 PK merchants(id), filter by suspended_at IS NULL — schema.ts:49 partial idx
 *
 * 在 5-merchant DB 上 EXPLAIN ANALYZE 預期: 全 Index Scan / Bitmap Heap Scan, < 5ms.
 */
export async function getOperatorQueue(): Promise<QueueItem[]> {
  const result = await dbAdmin.execute<AggRow>(sql`
    WITH product_signals AS (
      SELECT
        tenant_id,
        COUNT(*) FILTER (
          WHERE r2_key IS NULL OR r2_key = '' OR r2_key LIKE '%/fixtures/%'
        ) AS no_photo,
        COUNT(*) FILTER (WHERE LENGTH(title) < 8) AS short_title,
        COUNT(*) FILTER (WHERE stock_quantity = 0) AS zero_stock,
        COUNT(*) FILTER (
          WHERE price_cents = 0 OR price_cents IS NULL
        ) AS zero_price,
        COUNT(*) FILTER (
          WHERE stock_quantity > 0 AND stock_quantity <= 5
        ) AS low_stock
      FROM products
      GROUP BY tenant_id
    ),
    order_signals AS (
      SELECT
        tenant_id,
        COUNT(*) FILTER (WHERE status = 'paid') AS paid_unshipped,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_unpaid
      FROM orders
      GROUP BY tenant_id
    )
    SELECT
      m.id,
      m.slug,
      m.name,
      COALESCE(ps.no_photo, 0)        AS no_photo,
      COALESCE(ps.short_title, 0)     AS short_title,
      COALESCE(ps.zero_stock, 0)      AS zero_stock,
      COALESCE(ps.zero_price, 0)      AS zero_price,
      COALESCE(ps.low_stock, 0)       AS low_stock,
      COALESCE(os.paid_unshipped, 0)  AS paid_unshipped,
      COALESCE(os.pending_unpaid, 0)  AS pending_unpaid
    FROM merchants m
    LEFT JOIN product_signals ps ON ps.tenant_id = m.id
    LEFT JOIN order_signals   os ON os.tenant_id = m.id
    WHERE m.suspended_at IS NULL
  `);

  const items: QueueItem[] = [];

  for (const r of result.rows as AggRow[]) {
    // Per-merchant: expand each non-zero signal into a QueueItem.
    // Order doesn't matter here — we sort the whole list at the end.
    const counts: Array<{ type: SignalType; count: number }> = [
      { type: 'paid_unshipped', count: Number(r.paid_unshipped) },
      { type: 'zero_stock', count: Number(r.zero_stock) },
      { type: 'zero_price', count: Number(r.zero_price) },
      { type: 'low_stock', count: Number(r.low_stock) },
      { type: 'no_photo', count: Number(r.no_photo) },
      { type: 'short_title', count: Number(r.short_title) },
      { type: 'pending_unpaid', count: Number(r.pending_unpaid) },
    ];

    for (const c of counts) {
      if (c.count <= 0) continue;
      const meta = SIGNAL_META[c.type];
      items.push({
        merchantId: r.id,
        slug: r.slug,
        name: r.name,
        severity: meta.severity,
        signalType: c.type,
        count: c.count,
        reason: meta.reason(c.count),
        actionHref: buildActionHref(r.id, c.type),
      });
    }
  }

  // Sort: severity asc (P1 first), then count desc, then merchant name asc (stable).
  items.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    if (a.count !== b.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });

  return items;
}
