/**
 * 平台首頁公開 query (V1 #59, RA17)
 *
 * 用 dbAdmin (BYPASSRLS) 因為平台首頁無 RLS context (沒 cookie / 沒 tenant_id GUC)
 * 若改走 web_anon, current_setting('app.tenant_id') 會是 null → RLS 過濾全部 → return 0 rows
 *
 * 1. 熱門店鋪 (按 GMV desc, 空狀態 fallback createdAt desc)
 * 2. 新進駐 (近 7 天 onboarded)
 * 都過濾:
 *   - suspendedAt IS NULL  (停權商家不公開)
 *   - approvedAt IS NOT NULL (V1.7 D1: 還沒被 admin 核可的不公開)
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
 * 熱門店鋪 (top 6 by GMV, 空狀態 fallback createdAt)
 *
 * productCount 必須跟 storefront 顯示的一致。Storefront page.tsx 過濾
 * `WHERE is_published = true` (line 63), 所以這邊也只 count 已上架商品 —
 * 草稿 / needs_review 排除在外。否則卡片顯示「5 件商品」但點進去只看到 2
 * 件 (V2.6.x bug report)。
 */
export async function getFeaturedMerchants(limit = 6): Promise<FeaturedMerchant[]> {
  // 主 query: GMV desc
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
 * 新進駐 — 近 7 天 onboarded, hide 整個 section if 空
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
    gmvCents: 0, // 新進駐 GMV 不重要
    emoji: pickEmoji(r.slug, r.name),
  }));
}

/**
 * 平台 KPI for footer or hero stats (V1 沒用, 但留著)
 *
 * productCount 跟 merchant card 一樣只 count 已上架商品 (`is_published = true`),
 * 不然 hero 顯示「N 件商品」會比所有 storefront 加總更多 — 跟使用者點進去看到
 * 的不一致。同樣排除 suspended / unapproved merchants 的商品避免 stat 灌水。
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
