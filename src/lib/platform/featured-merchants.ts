/**
 * Platform home-page public queries (V1 #59, RA17)
 *
 * Uses dbAdmin (BYPASSRLS) because the platform home page has no RLS context
 * (no cookie / no tenant_id GUC). If routed through web_anon,
 * current_setting('app.tenant_id') is null → RLS filters everything → 0 rows returned.
 *
 * 1. Featured stores (by GMV desc, fallback to createdAt desc when empty)
 * 2. Recent arrivals (onboarded within last 7 days)
 * Both filter:
 *   - suspendedAt IS NULL    (suspended merchants are not public)
 *   - approvedAt IS NOT NULL (V1.7 D1: not-yet-approved merchants are not public)
 *
 * Subquery quirk worth knowing: Drizzle's `${products.tenantId}` interpolates
 * the BARE column name, not `"products"."tenant_id"`. In a correlated subquery
 * `(SELECT ... FROM products WHERE ${products.tenantId} = ${merchants.id})`,
 * `${merchants.id}` ALSO becomes `"id"` — and Postgres resolves bare `"id"`
 * to the inner-scope `products.id`, not the outer `merchants.id`. Result:
 * `WHERE products.tenant_id = products.id` is always false → all subquery
 * counts return 0. Pre-V2.6.x bug. Fix: write the subquery with literal
 * qualified names (`products.tenant_id = merchants.id`) instead of relying
 * on Drizzle's interpolation.
 */
import { dbAdmin } from '@/db/admin-only';
import { merchants, products } from '@/db/schema';
import { count, desc, isNotNull, isNull, sql, and } from 'drizzle-orm';

export type FeaturedMerchant = {
  id: string;
  slug: string;
  name: string;
  brandVoice: string | null;
  emoji: string | null;
  themeVars: Record<string, string>;
  productCount: number;
  gmvCents: number;
};

const SEED_EMOJI: Record<string, string> = {
  akami: '🍵',
  afen: '🍗',
};

function pickEmoji(slug: string, name: string): string | null {
  if (SEED_EMOJI[slug]) return SEED_EMOJI[slug];
  // Hash-based emoji for non-seed merchants — pool of generic store emojis
  const POOL = ['🛍️', '🌿', '☕', '🧁', '🍞', '🎨', '📦', '🌸', '🍜', '🧶', '🪴', '🍷'];
  let h = 0;
  for (const ch of name + slug) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return POOL[Math.abs(h) % POOL.length];
}

/**
 * Featured stores (top 6 by GMV, fallback to createdAt when empty)
 *
 * productCount must match what the storefront shows. Storefront page.tsx filters
 * `WHERE is_published = true` (line 63), so this also only counts published products —
 * drafts / needs_review excluded. Otherwise the card shows "5 products" but the
 * user clicks in and only sees 2 (V2.6.x bug report).
 */
export async function getFeaturedMerchants(limit = 6): Promise<FeaturedMerchant[]> {
  // Main query: GMV desc
  const rows = await dbAdmin
    .select({
      id: merchants.id,
      slug: merchants.slug,
      name: merchants.name,
      brandVoice: merchants.brandVoice,
      themeVars: merchants.themeVars,
      productCount: sql<number>`(SELECT COUNT(*)::int FROM products WHERE products.tenant_id = merchants.id AND products.is_published = true)`.mapWith(
        Number,
      ),
      gmvCents: sql<number>`COALESCE((SELECT SUM(orders.total_cents)::bigint FROM orders WHERE orders.tenant_id = merchants.id AND orders.status IN ('paid','shipped','completed')), 0)::bigint`.mapWith(
        Number,
      ),
    })
    .from(merchants)
    .where(and(isNull(merchants.suspendedAt), isNotNull(merchants.approvedAt)))
    .orderBy(
      sql`COALESCE((SELECT SUM(orders.total_cents)::bigint FROM orders WHERE orders.tenant_id = merchants.id AND orders.status IN ('paid','shipped','completed')), 0) DESC, ${merchants.createdAt} DESC`,
    )
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    themeVars: (r.themeVars ?? {}) as Record<string, string>,
    emoji: pickEmoji(r.slug, r.name),
  }));
}

/**
 * Recent arrivals — onboarded within last 7 days; hide the whole section if empty
 */
export async function getRecentMerchants(limit = 6): Promise<FeaturedMerchant[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await dbAdmin
    .select({
      id: merchants.id,
      slug: merchants.slug,
      name: merchants.name,
      brandVoice: merchants.brandVoice,
      themeVars: merchants.themeVars,
      createdAt: merchants.createdAt,
      productCount: sql<number>`(SELECT COUNT(*)::int FROM products WHERE products.tenant_id = merchants.id AND products.is_published = true)`.mapWith(
        Number,
      ),
    })
    .from(merchants)
    .where(
      sql`${merchants.suspendedAt} IS NULL AND ${merchants.approvedAt} IS NOT NULL AND ${merchants.createdAt} >= ${sevenDaysAgo}`,
    )
    .orderBy(desc(merchants.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    brandVoice: r.brandVoice,
    themeVars: (r.themeVars ?? {}) as Record<string, string>,
    productCount: r.productCount,
    gmvCents: 0, // GMV not relevant for recent arrivals
    emoji: pickEmoji(r.slug, r.name),
  }));
}

/**
 * Platform KPI for footer or hero stats (unused in V1, but kept around)
 *
 * productCount, like the merchant card, only counts published products
 * (`is_published = true`); otherwise the hero "N products" figure would exceed
 * the sum of all storefronts — inconsistent with what the user sees on click-through.
 * Also excludes products from suspended / unapproved merchants to prevent stat inflation.
 */
export async function getPlatformStats(): Promise<{ merchantCount: number; productCount: number }> {
  const [m] = await dbAdmin
    .select({ n: count(merchants.id) })
    .from(merchants)
    .where(and(isNull(merchants.suspendedAt), isNotNull(merchants.approvedAt)));
  const [p] = await dbAdmin
    .select({ n: count(products.id) })
    .from(products)
    .innerJoin(merchants, sql`${products.tenantId} = ${merchants.id}`)
    .where(
      and(
        sql`${products.isPublished} = true`,
        isNull(merchants.suspendedAt),
        isNotNull(merchants.approvedAt),
      ),
    );
  return { merchantCount: m?.n ?? 0, productCount: p?.n ?? 0 };
}
