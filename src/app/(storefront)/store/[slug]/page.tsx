/**
 * Storefront 首頁 — 列出 published 商品
 */
import Link from 'next/link';
import { resolveSlugRedirect, resolveStorefrontMeta } from '@/lib/tenant/resolver';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products } from '@/db/schema';
import { notFound, redirect } from 'next/navigation';
import { eq, desc } from 'drizzle-orm';
import { Pause, ShoppingBag } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = await resolveStorefrontMeta(slug);

  // 若 slug 不存在 — 看是否 match previousSlug, 是的話 301 redirect 到新 slug
  if (!meta) {
    const newSlug = await resolveSlugRedirect(slug);
    if (newSlug) redirect(`/store/${newSlug}`);
    notFound();
  }

  // 商家被平台停權 — 顯示「暫停營業中」(200 OK 不是 503, SEO 不爆)
  if (meta.suspendedAt) {
    return (
      <main
        className="flex min-h-screen items-center justify-center px-6"
        style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
      >
        <div className="max-w-md text-center">
          <Pause
            className="mx-auto mb-4 h-12 w-12 opacity-40"
            strokeWidth={1.4}
            style={{ color: 'var(--brand-primary)' }}
          />
          <h1
            className="t-h2"
            style={{ fontFamily: 'var(--brand-font-heading)' }}
          >
            {meta.name} 暫停營業中
          </h1>
          {meta.suspendedReason ? (
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
      className="min-h-screen px-6 py-12 md:px-12"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto max-w-6xl">
        {items.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4 py-32 text-center"
            style={{
              borderRadius: 'calc(var(--brand-radius) * 4)',
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
              border: '1px dashed color-mix(in srgb, var(--brand-primary) 22%, transparent)',
            }}
          >
            <ShoppingBag className="h-12 w-12 opacity-50" strokeWidth={1.4} style={{ color: 'var(--brand-primary)' }} />
            <div className="space-y-1">
              <p className="t-h3" style={{ fontFamily: 'var(--brand-font-heading)' }}>
                老闆在後台手忙腳亂
              </p>
              <p className="t-small opacity-60">等等再來逛, 馬上就有商品上架。</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => {
              const hasImg = p.r2Key && !p.r2Key.includes('/fixtures/');
              return (
                <Link
                  key={p.id}
                  href={`/store/${slug}/products/${p.id}`}
                  className="hover-lift block overflow-hidden border"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
                    borderRadius: 'var(--brand-radius)',
                    backgroundColor: 'color-mix(in srgb, var(--brand-primary) 2%, var(--brand-bg))',
                    boxShadow: 'var(--elev-1)',
                  }}
                >
                  {hasImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/uploads/${p.r2Key}`}
                      alt={p.title}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex aspect-square items-center justify-center"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)' }}
                    >
                      <ShoppingBag className="h-12 w-12 opacity-30" style={{ color: 'var(--brand-primary)' }} />
                    </div>
                  )}
                  <div className="space-y-2 p-5">
                    <h2
                      className="t-h3 line-clamp-2"
                      style={{ fontFamily: 'var(--brand-font-heading)' }}
                    >
                      {p.title}
                    </h2>
                    <p
                      className="t-small line-clamp-2"
                      style={{ color: 'color-mix(in srgb, var(--brand-text) 65%, transparent)' }}
                    >
                      {p.description}
                    </p>
                    <p className="t-tabular text-lg font-semibold" style={{ color: 'var(--brand-primary)' }}>
                      NT$ {(p.priceCents / 100).toLocaleString()}
                    </p>
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
