/**
 * Cross-merchant operator queue (V1.6 Track A8)
 *
 * Admin view: "which merchants need intervention + why".
 * The `/admin/queue` page directly consumes the QueueItem[] this helper returns.
 *
 * Difference vs src/lib/merchant/health-checks.ts:
 *   - health-checks: per-tenant, uses withTenantTx (RLS-safe), merchant viewing own
 *   - operator-queue: cross-tenant, uses dbAdmin (BYPASSRLS), admin viewing platform-wide
 *   - 2 extra order signals (paid_unshipped / pending_unpaid) that health-checks doesn't have
 *
 * Why ONE compound CTE (Codex Eng E3 finding):
 *   - 5 merchants × (4 product signals + 2 order signals) = 30 round-trips in the naive form
 *   - At 1000 merchants this blows up. GROUP BY tenant_id + LEFT JOIN merchants gets it all in one round-trip
 *   - COUNT(*) FILTER (WHERE ...) is a single-pass aggregate in Postgres, faster than 6 sub-queries
 *
 * Severity rules hardcoded (V1.6, V2 may promote to schema):
 *   - P1 paid_unshipped     paid pending shipment (revenue blocker, customer waiting)
 *   - P2 zero_stock         product zero stock (catalog blocker)
 *   - P2 zero_price         product $0 price (catalog blocker)
 *   - P3 low_stock          product low stock (early warning, aligned with V1 schema lowStockThreshold default=5)
 *   - P3 no_photo           product missing photo (same condition as health-checks: NULL/empty/fixtures path)
 *   - P4 short_title        product title too short (<8 chars, same threshold as health-checks)
 *   - P5 pending_unpaid     order unpaid (customer hasn't paid, limited merchant action)
 *
 * Sort: severity asc (P1 first), within same severity by count desc.
 *
 * Suspended merchant excluded — admin shouldn't be nudged to intervene on suspended merchants.
 */
import { sql } from 'drizzle-orm';
import { dbAdmin } from '@/db/admin-only';

export type Severity = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export type SignalType =
  | 'pending_approval' // P1 awaiting admin approval (V1.7 D1)
  | 'paid_unshipped'   // P1 paid pending shipment
  | 'zero_stock'       // P2 product zero stock
  | 'zero_price'       // P2 product $0 price
  | 'low_stock'        // P3 product low stock
  | 'no_photo'         // P3 product missing photo
  | 'short_title'      // P4 product title too short
  | 'pending_unpaid';  // P5 order unpaid

export type QueueItem = {
  merchantId: string;
  slug: string;
  name: string;
  severity: Severity;
  signalType: SignalType;
  /** Number of products / orders */
  count: number;
  /** Human-readable text shown to admin */
  reason: string;
  /** Link to /admin/merchants/[id]?focus=... */
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
  pending_approval: {
    severity: 'P1',
    reason: () => `新商家待審核 · 點擊核可`,
  },
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
  /** V1.7 D1: 1 if approved_at IS NULL else 0 (cast as int for downstream summing) */
  pending_approval: string | number;
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
 * Postgres plan:
 *   - product_signals CTE: one GROUP BY tenant_id, COUNT FILTER over 5 conditions
 *     uses idx products(tenant_id) — already built at schema.ts:117
 *   - order_signals CTE:   one GROUP BY tenant_id, COUNT FILTER over 2 statuses
 *     uses idx orders(tenant_id, status, created_at) — already built at schema.ts:175
 *   - merchants main query: LEFT JOIN both CTEs on tenant_id
 *     uses PK merchants(id), filter by suspended_at IS NULL — schema.ts:49 partial idx
 *
 * On a 5-merchant DB, EXPLAIN ANALYZE expects: all Index Scan / Bitmap Heap Scan, < 5ms.
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
      CASE WHEN m.approved_at IS NULL THEN 1 ELSE 0 END AS pending_approval,
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
      { type: 'pending_approval', count: Number(r.pending_approval) },
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
