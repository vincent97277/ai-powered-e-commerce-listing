/**
 * 商家商品列表 — 看自己所有商品 (透過 RLS, 只看到自己的)
 */
import Link from 'next/link';
import { cookies } from 'next/headers';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { Plus, Package, ImageIcon } from 'lucide-react';
import { ProductRowActions } from './ProductRowActions';

export const dynamic = 'force-dynamic';

export default async function MerchantProductsList() {
  const c = await cookies();
  const merchant = await resolveMerchantFromCookie(c.get('demo-merchant-id')?.value);

  const items = await withTenantTx(merchant.tenantId, async (tx) => {
    return await tx
      .select()
      .from(products)
      .orderBy(desc(products.createdAt))
      .limit(100);
  });

  return (
    <main
      className="min-h-screen px-12 py-10"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex items-end justify-between gap-6">
          <div>
            <p className="t-caption" style={{ color: 'var(--brand-primary)' }}>
              商品管理
            </p>
            <h1 className="t-h1" style={{ fontFamily: 'var(--brand-font-heading)' }}>
              你的所有商品
            </h1>
            <p className="t-small mt-1 opacity-60">
              共 {items.length} 件 · {items.filter((p) => p.isPublished).length} 件已上架
            </p>
          </div>
          <Link
            href="/merchant/products/new"
            className="hover-lift inline-flex items-center gap-2 px-6 py-3 text-base font-semibold elev-2"
            style={{
              backgroundColor: 'var(--brand-primary)',
              color: 'var(--brand-bg)',
              borderRadius: 'var(--brand-radius)',
              fontFamily: 'var(--brand-font-heading)',
            }}
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            上架新商品
          </Link>
        </header>

        {items.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4 py-24 text-center"
            style={{
              borderRadius: 'calc(var(--brand-radius) * 4)',
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
              border: '1px dashed color-mix(in srgb, var(--brand-primary) 22%, transparent)',
            }}
          >
            <Package className="h-12 w-12 opacity-50" strokeWidth={1.4} style={{ color: 'var(--brand-primary)' }} />
            <p className="t-h3" style={{ fontFamily: 'var(--brand-font-heading)' }}>
              還沒有商品
            </p>
            <p className="t-small opacity-60">拍張照片, 60 秒生出第一件商品。</p>
            <Link
              href="/merchant/products/new"
              className="hover-lift mt-2 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: 'var(--brand-bg)',
                borderRadius: 'var(--brand-radius)',
              }}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
              新增第一件商品
            </Link>
          </div>
        ) : (
          <div
            className="overflow-hidden border"
            style={{
              borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
              borderRadius: 'var(--brand-radius)',
              backgroundColor: 'var(--brand-bg)',
            }}
          >
            <table className="w-full">
              <thead
                style={{
                  borderBottom: '1px solid color-mix(in srgb, var(--brand-primary) 14%, transparent)',
                  backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
                }}
              >
                <tr className="text-left">
                  <th className="t-caption px-4 py-3 font-medium" style={{ color: 'var(--brand-primary)' }}>商品</th>
                  <th className="t-caption px-4 py-3 font-medium" style={{ color: 'var(--brand-primary)' }}>定價</th>
                  <th className="t-caption px-4 py-3 font-medium" style={{ color: 'var(--brand-primary)' }}>狀態</th>
                  <th className="t-caption px-4 py-3 font-medium" style={{ color: 'var(--brand-primary)' }}>建立</th>
                  <th className="t-caption px-4 py-3 font-medium text-right" style={{ color: 'var(--brand-primary)' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p, i) => {
                  const hasImg = p.r2Key && !p.r2Key.includes('/fixtures/');
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-brand-soft transition-colors"
                      style={{
                        borderBottom: i < items.length - 1
                          ? '1px solid color-mix(in srgb, var(--brand-primary) 10%, transparent)'
                          : undefined,
                      }}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/merchant/products/${p.id}`}
                          className="flex items-center gap-3 hover:opacity-80"
                        >
                          <div
                            className="h-12 w-12 shrink-0 overflow-hidden"
                            style={{
                              borderRadius: 'var(--brand-radius)',
                              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)',
                            }}
                          >
                            {hasImg ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/uploads/${p.r2Key}`} alt={p.title} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <ImageIcon className="h-5 w-5 opacity-40" style={{ color: 'var(--brand-primary)' }} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p
                              className="t-body line-clamp-1 font-medium"
                              style={{ fontFamily: 'var(--brand-font-heading)' }}
                            >
                              {p.title}
                            </p>
                            <p
                              className="t-small line-clamp-1"
                              style={{ color: 'color-mix(in srgb, var(--brand-text) 50%, transparent)' }}
                            >
                              {p.description.slice(0, 60)}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="t-tabular px-4 py-3 text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
                        NT$ {(p.priceCents / 100).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
                          style={{
                            backgroundColor: p.isPublished
                              ? 'color-mix(in srgb, var(--success) 12%, transparent)'
                              : 'color-mix(in srgb, var(--brand-primary) 8%, transparent)',
                            color: p.isPublished ? 'var(--success)' : 'color-mix(in srgb, var(--brand-text) 60%, transparent)',
                            borderRadius: 'var(--brand-radius)',
                          }}
                        >
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: p.isPublished ? 'var(--success)' : 'var(--brand-primary)' }}
                          />
                          {p.isPublished ? '已上架' : '草稿'}
                        </span>
                      </td>
                      <td className="t-small px-4 py-3 opacity-50">
                        {new Date(p.createdAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ProductRowActions
                          productId={p.id}
                          isPublished={p.isPublished}
                          merchantSlug={merchant.slug}
                          title={p.title}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
