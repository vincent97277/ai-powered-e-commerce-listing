/**
 * Storefront 公開頁 (訪客看的)
 * 用 ensureStorefrontTenant 把 slug 轉 tenant_id
 * 後續 query 都走 withTenantTx + dbUser (RLS 強制)
 */
import { ensureStorefrontTenant } from '@/lib/tenant/resolver';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products } from '@/db/schema';

// 強制 dynamic — 訪客頁需要 RLS context，不可 build time pre-render
export const dynamic = 'force-dynamic';

export default async function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenantId = await ensureStorefrontTenant(slug);

  const items = await withTenantTx(tenantId, async (tx) => {
    return await tx.select().from(products).limit(20);
  });

  return (
    <main className="min-h-screen px-12 py-8" style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <h1 className="text-4xl" style={{ fontFamily: 'var(--brand-font-heading)' }}>
        {slug} 的商品
      </h1>
      <div className="mt-8 grid grid-cols-3 gap-6">
        {items.map((p) => (
          <article key={p.id} className="rounded-lg border p-4"
            style={{ borderColor: 'var(--brand-primary)' + '20', borderRadius: 'var(--brand-radius)' }}>
            <h2 className="text-lg font-semibold">{p.title}</h2>
            <p className="mt-2 text-sm opacity-70 line-clamp-3">{p.description}</p>
            <p className="mt-4 text-xl" style={{ color: 'var(--brand-primary)' }}>
              NT$ {p.priceCents}
            </p>
          </article>
        ))}
        {items.length === 0 && <p className="col-span-3 opacity-50">尚無商品</p>}
      </div>
    </main>
  );
}
