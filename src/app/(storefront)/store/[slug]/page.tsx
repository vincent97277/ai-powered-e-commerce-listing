/**
 * Storefront homepage — lists published products
 */
import Link from 'next/link';
import { resolveSlugRedirect, resolveStorefrontMeta } from '@/lib/tenant/resolver';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products } from '@/db/schema';
import { notFound, redirect } from 'next/navigation';
import { eq, desc } from 'drizzle-orm';
import { Pause, ShoppingBag } from 'lucide-react';
import { EmptyState } from '@/components/feedback/EmptyState';
import { imageUrlFor } from '@/lib/storage/public-url-client';

export const dynamic = 'force-dynamic';

export default async function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = await resolveStorefrontMeta(slug);

  // If slug doesn't exist — check whether it matches a previousSlug; if so, 301 redirect to the new slug
  if (!meta) {
    const newSlug = await resolveSlugRedirect(slug);
    if (newSlug) redirect(`/store/${newSlug}`);
    notFound();
  }

  // Merchant suspended by the platform OR not yet admin-approved (V1.7 D1) — show "Paused" state
  // Both states give the same customer-facing experience (storefront hidden); internal reason is not exposed.
  // 200 OK, not 503, so SEO doesn't tank.
  const isUnavailable = meta.suspendedAt != null || meta.approvedAt == null;
  if (isUnavailable) {
    return (
      <main
        className="flex min-h-screen items-center justify-center px-4 sm:px-6"
        style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
      >
        <div className="max-w-md text-center">
          <Pause
            className="mx-auto mb-4 h-12 w-12 opacity-40"
            strokeWidth={1.5}
            style={{ color: 'var(--brand-primary)' }}
          />
          <h1
            className="t-h2"
            style={{ fontFamily: 'var(--brand-font-heading)' }}
          >
            {meta.name} 暫停營業中
          </h1>
          {meta.suspendedAt && meta.suspendedReason ? (
            <p className="t-small mt-3 opacity-70">{meta.suspendedReason}</p>
          ) : (
            <p className="t-small mt-3 opacity-60">店家暫時無法接受訂單, 請稍後再來</p>
          )}
        </div>
      </main>
    );
  }

  const items = await withTenantTx(meta.tenantId, async (tx) => {
    return await tx
      .select()
      .from(products)
      .where(eq(products.isPublished, true))
      .orderBy(desc(products.createdAt))
      .limit(60);
  });

  return (
    <main
      className="min-h-screen px-4 py-8 sm:px-8 sm:py-12 lg:px-12"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto max-w-6xl">
        {items.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="老闆在後台手忙腳亂"
            body="等等再來逛, 馬上就有商品上架"
            tone="brand"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {items.map((p) => {
              const hasImg = p.r2Key && !p.r2Key.includes('/fixtures/');
              return (
                <Link
                  key={p.id}
                  href={`/store/${slug}/products/${p.id}`}
                  className="hover-lift group block overflow-hidden border"
                  style={{
                    borderColor: 'var(--brand-edge-18)',
                    borderRadius: 'calc(var(--brand-radius) * 2)',
                    backgroundColor: 'var(--brand-bg)',
                  }}
                >
                  <div
                    className="overflow-hidden"
                    style={{
                      borderRadius: 'calc(var(--brand-radius) * 2) calc(var(--brand-radius) * 2) 0 0',
                    }}
                  >
                    {hasImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrlFor(p.r2Key)}
                        alt={p.title}
                        className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <div
                        className="flex aspect-square items-center justify-center transition-transform duration-500 group-hover:scale-[1.04]"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)' }}
                      >
                        <ShoppingBag
                          className="h-12 w-12 opacity-30"
                          strokeWidth={1.5}
                          style={{ color: 'var(--brand-primary)' }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 p-4">
                    <h3
                      className="line-clamp-2 text-sm font-semibold leading-snug"
                      style={{ color: 'var(--brand-text)', fontFamily: 'var(--brand-font-heading)' }}
                    >
                      {p.title}
                    </h3>
                    {p.description && (
                      <p
                        className="line-clamp-2 text-xs leading-relaxed"
                        style={{ color: 'var(--ink-muted)' }}
                      >
                        {p.description}
                      </p>
                    )}
                    <div
                      className="flex items-baseline justify-between gap-2 pt-2 border-t"
                      style={{ borderColor: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' }}
                    >
                      <p
                        className="t-tabular text-xl font-semibold"
                        style={{ color: 'var(--brand-primary)', fontFamily: 'var(--brand-font-heading)' }}
                      >
                        NT$ {(p.priceCents / 100).toLocaleString()}
                      </p>
                      <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                        查看 →
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
