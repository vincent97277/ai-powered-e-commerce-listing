/**
 * Slug → tenant_id resolver (for storefront public routes)
 * Uses dbAdmin (BYPASSRLS) because the visitor has no tenant context yet — this is the
 * legitimate "bypass to find out the tenant_id" case.
 * Once resolved, all subsequent queries go through withTenantTx(tenantId, ...) on dbUser.
 *
 * Cache: tag-based invalidation (call invalidateSlug when a merchant changes slug)
 */
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { unstable_cache, revalidateTag } from 'next/cache';
import { notFound } from 'next/navigation';

const tagFor = (slug: string) => `tenant-slug:${slug}`;

/**
 * Get tenant_id (uuid) from slug
 * @param slug merchant URL slug (e.g. 'sweet-bakery')
 * @returns tenant_id (uuid) or null
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
    { tags: [tagFor(slug)], revalidate: 300 } // 5 minute fallback, but tag invalidation takes priority
  )();

/** Fetch tenant_id + public data (merchant name + suspension + approval state) together, for storefront.
 *  V1.7 D1: added approvedAt — null means awaiting admin approval; storefront treats as "temporarily closed".
 *  V1.9 T3 O2: added brandVoice — order confirmation page uses it to generate merchant-voiced thank-you. */
export const resolveStorefrontMeta = (slug: string) =>
  unstable_cache(
    async (): Promise<{
      tenantId: string;
      name: string;
      brandVoice: string | null;
      suspendedAt: Date | null;
      suspendedReason: string | null;
      approvedAt: Date | null;
    } | null> => {
      const rows = await dbAdmin
        .select({
          id: merchants.id,
          name: merchants.name,
          brandVoice: merchants.brandVoice,
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
        brandVoice: rows[0].brandVoice,
        suspendedAt: rows[0].suspendedAt,
        suspendedReason: rows[0].suspendedReason,
        approvedAt: rows[0].approvedAt,
      };
    },
    [`storefront-meta-${slug}`],
    { tags: [tagFor(slug)], revalidate: 300 }
  )();

/**
 * If the input slug isn't a current active slug but matches some merchant's previousSlug → return the new slug.
 * Used by storefront for 301 redirects (V1 #52).
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
 * Called when a merchant changes their slug in settings; cache invalidates immediately.
 */
export function invalidateSlug(oldSlug: string, newSlug: string) {
  revalidateTag(tagFor(oldSlug));
  revalidateTag(tagFor(newSlug));
}

/**
 * Every storefront route's root layout goes through this.
 * Slug not found → automatically notFound() (404).
 */
export async function ensureStorefrontTenant(slug: string): Promise<string> {
  const tenantId = await resolveTenantBySlug(slug);
  if (!tenantId) notFound();
  return tenantId;
}
