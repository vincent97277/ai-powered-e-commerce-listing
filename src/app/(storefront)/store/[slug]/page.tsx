/**
 * Storefront 公開頁 (訪客看的)
 * 用 ensureStorefrontTenant 把 slug 轉 tenant_id
 * 後續 query 都走 withTenantTx + dbUser (RLS 強制)
 */
import { resolveStorefrontMeta } from '@/lib/tenant/resolver';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products } from '@/db/schema';
import { notFound } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';

// 強制 dynamic — 訪客頁需要 RLS context，不可 build time pre-render
export const dynamic = 'force-dynamic';

export default async function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = await resolveStorefrontMeta(slug);
  if (!meta) notFound();
  const { tenantId, name: merchantName } = meta;

  const items = await withTenantTx(tenantId, async (tx) => {
    return await tx.select().from(products).limit(20);
  });

  return (
    <main
      className="min-h-screen px-12 py-12"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <header className="mx-auto max-w-6xl border-b pb-8" style={{ borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)' }}>
        <p className="t-caption mb-2" style={{ color: 'var(--brand-primary)' }}>
          STOREFRONT
        </p>
        <h1 className="t-h1" style={{ fontFamily: 'var(--brand-font-heading)' }}>
          {merchantName}
        </h1>
      </header>

      <div className="mx-auto mt-10 max-w-6xl">
        {items.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4 py-24 text-center"
            style={{
              borderRadius: 'calc(var(--brand-radius) * 4)',
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
              border: '1px dashed color-mix(in srgb, var(--brand-primary) 22%, transparent)',
            }}
          >
            <ShoppingBag
              className="h-12 w-12 opacity-50"
              strokeWidth={1.4}
              style={{ color: 'var(--brand-primary)' }}
            />
            <div className="space-y-1">
              <p className="t-h3" style={{ fontFamily: 'var(--brand-font-heading)' }}>
                老闆在後台手忙腳亂
              </p>
              <p className="t-small opacity-60">等等再來逛，馬上就有商品上架。</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <article
                key={p.id}
                className="hover-lift overflow-hidden border p-5"
                style={{
                  borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
                  borderRadius: 'var(--brand-radius)',
                  backgroundColor: 'color-mix(in srgb, var(--brand-primary) 2%, var(--brand-bg))',
                  boxShadow: 'var(--elev-1)',
                }}
              >
                <h2 className="t-h3 mb-2" style={{ fontFamily: 'var(--brand-font-heading)' }}>
                  {p.title}
                </h2>
                <p
                  className="t-small line-clamp-3"
                  style={{ color: 'color-mix(in srgb, var(--brand-text) 70%, transparent)' }}
                >
                  {p.description}
                </p>
                <p
                  className="t-tabular mt-4 text-xl font-semibold"
                  style={{ color: 'var(--brand-primary)' }}
                >
                  NT$ {(p.priceCents / 100).toLocaleString()}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
