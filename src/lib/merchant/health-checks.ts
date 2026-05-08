/**
 * Merchant storefront health v0 (V1.5 Track B1)
 *
 * Surfaces obvious issues with a merchant's products (no photo / short title / out of stock / no price),
 * returns top 3 issues by count. All 0 → return [], parent hides the whole section.
 *
 * Uses withTenantTx (per-merchant data, RLS-safe) — NOT dbAdmin.
 *
 * Pattern after PendingCallout v1 (#72): no scorecard, use chip family.
 *
 * Single SQL with COUNT(*) FILTER (WHERE ...) — one round-trip, RLS-safe.
 */
import { sql } from 'drizzle-orm';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products } from '@/db/schema';

export type HealthIssueType = 'no_photo' | 'short_title' | 'zero_stock' | 'zero_price';

export type HealthIssue = {
  type: HealthIssueType;
  count: number;
  label: string;
  filterUrl: string;
};

const ISSUE_LABELS: Record<HealthIssueType, (n: number) => string> = {
  no_photo: (n) => `${n} 件商品缺照片`,
  short_title: (n) => `${n} 件標題太短 (<8 字)`,
  zero_stock: (n) => `${n} 件缺貨`,
  zero_price: (n) => `${n} 件未定價`,
};

const ISSUE_FILTER_URL: Record<HealthIssueType, string> = {
  no_photo: '/merchant/products?filter=no_photo',
  short_title: '/merchant/products?filter=short_title',
  zero_stock: '/merchant/products?filter=zero_stock',
  zero_price: '/merchant/products?filter=zero_price',
};

/**
 * Get merchant storefront health issues
 * - 4 counts in one SQL (COUNT FILTER) in a single round-trip
 * - Filter out types with count = 0
 * - Sort by count desc
 * - Return top 3
 */
export async function getHealthIssues(tenantId: string): Promise<HealthIssue[]> {
  const [row] = await withTenantTx(tenantId, async (tx) => {
    return await tx
      .select({
        // V1.5 review M4: fixture demo images also count as "no photo" (list page hasImg already uses
        //                  the same condition to hide; health chip stays consistent with page)
        noPhoto: sql<number>`count(*) filter (where ${products.r2Key} IS NULL OR ${products.r2Key} = '' OR ${products.r2Key} LIKE '%/fixtures/%')::int`.mapWith(
          Number,
        ),
        shortTitle: sql<number>`count(*) filter (where length(${products.title}) < 8)::int`.mapWith(Number),
        zeroStock: sql<number>`count(*) filter (where ${products.stockQuantity} = 0)::int`.mapWith(Number),
        zeroPrice: sql<number>`count(*) filter (where ${products.priceCents} = 0 OR ${products.priceCents} IS NULL)::int`.mapWith(
          Number,
        ),
      })
      .from(products);
  });

  const counts: Array<{ type: HealthIssueType; count: number }> = [
    { type: 'no_photo', count: row?.noPhoto ?? 0 },
    { type: 'short_title', count: row?.shortTitle ?? 0 },
    { type: 'zero_stock', count: row?.zeroStock ?? 0 },
    { type: 'zero_price', count: row?.zeroPrice ?? 0 },
  ];

  return counts
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((c) => ({
      type: c.type,
      count: c.count,
      label: ISSUE_LABELS[c.type](c.count),
      filterUrl: ISSUE_FILTER_URL[c.type],
    }));
}
