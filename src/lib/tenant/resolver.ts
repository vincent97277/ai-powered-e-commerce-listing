/**
 * Slug → tenant_id resolver (給 storefront 公開路由用)
 * 用 dbAdmin (BYPASSRLS) 因為訪客還沒 tenant context — 這是合法的「為了找出 tenant_id 而 bypass」
 * 一旦解析完成，後續所有 query 走 withTenantTx(tenantId, ...) 用 dbUser
 *
 * Cache: tag-based invalidation (商家改 slug 時呼叫 invalidateSlug)
 */
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { unstable_cache, revalidateTag } from 'next/cache';
import { notFound } from 'next/navigation';

const tagFor = (slug: string) => `tenant-slug:${slug}`;

/**
 * 從 slug 取 tenant_id (uuid)
 * @param slug 商家 URL slug (例: 'sweet-bakery')
 * @returns tenant_id (uuid) 或 null
 */
export const resolveTenantBySlug = (slug: string) =>
  unstable_cache(
    async (): Promise<string | null> => {
      const rows = await dbAdmin
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.slug, slug))
        .limit(1);
      return rows[0]?.id ?? null;
    },
    [`tenant-by-slug-${slug}`],
    { tags: [tagFor(slug)], revalidate: 300 } // 5 分鐘 fallback，但 tag 失效優先
  )();

/** 同時拿 tenant_id + 公開資料 (商家名 + 停權 + 審核狀態), 給 storefront 用.
 *  V1.7 D1: 加 approvedAt — null 表示等待 admin 核可, storefront 視為「暫停營業中」 */
export const resolveStorefrontMeta = (slug: string) =>
  unstable_cache(
    async (): Promise<{
      tenantId: string;
      name: string;
      suspendedAt: Date | null;
      suspendedReason: string | null;
      approvedAt: Date | null;
    } | null> => {
      const rows = await dbAdmin
        .select({
          id: merchants.id,
          name: merchants.name,
          suspendedAt: merchants.suspendedAt,
          suspendedReason: merchants.suspendedReason,
          approvedAt: merchants.approvedAt,
        })
        .from(merchants)
        .where(eq(merchants.slug, slug))
        .limit(1);
      if (!rows[0]) return null;
      return {
        tenantId: rows[0].id,
        name: rows[0].name,
        suspendedAt: rows[0].suspendedAt,
        suspendedReason: rows[0].suspendedReason,
        approvedAt: rows[0].approvedAt,
      };
    },
    [`storefront-meta-${slug}`],
    { tags: [tagFor(slug)], revalidate: 300 }
  )();

/**
 * 若輸入 slug 不是當前 active slug, 但 match 某商家的 previousSlug → 回新 slug
 * 給 storefront 做 301 redirect 用 (V1 #52)
 */
export const resolveSlugRedirect = (slug: string) =>
  unstable_cache(
    async (): Promise<string | null> => {
      const rows = await dbAdmin
        .select({ slug: merchants.slug })
        .from(merchants)
        .where(eq(merchants.previousSlug, slug))
        .limit(1);
      return rows[0]?.slug ?? null;
    },
    [`slug-redirect-${slug}`],
    { tags: [tagFor(slug)], revalidate: 300 }
  )();

/**
 * 商家在 settings 改 slug 時呼叫，cache 立即失效
 */
export function invalidateSlug(oldSlug: string, newSlug: string) {
  revalidateTag(tagFor(oldSlug));
  revalidateTag(tagFor(newSlug));
}

/**
 * Storefront 路由的 root layout 都會走這個
 * 找不到 slug → 自動 notFound() (404)
 */
export async function ensureStorefrontTenant(slug: string): Promise<string> {
  const tenantId = await resolveTenantBySlug(slug);
  if (!tenantId) notFound();
  return tenantId;
}
