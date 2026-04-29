/**
 * 商家商品詳情頁 (server component) — 從 DB 撈真實商品資料
 * 透過 RLS 確保只看得到自己的商品
 */
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { withTenantTx } from '@/lib/db/with-tenant';
import { dbAdmin } from '@/db/admin-only';
import { merchants, products } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { DEMO_MERCHANT_COOKIE, getMerchantFromCookie } from '@/lib/storage/demo-merchants';
import { ProductHeader } from '@/components/products/ProductHeader';
import { ProductDescription } from '@/components/products/ProductDescription';
import { TagsChips } from '@/components/products/TagsChips';
import { VariantsTable } from '@/components/products/VariantsTable';
import { PriceCard } from '@/components/products/PriceCard';
import { ShopeeExportTab } from '@/components/products/ShopeeExportTab';
import { PublishToggle } from '@/components/products/PublishToggle';
import { aiOutputToUi } from '@/lib/ai/flatten';
import type { ProductOutput as UiProductOutput } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function resolveTenant(): Promise<{ tenantId: string; slug: string } | null> {
  const c = await cookies();
  const cv = c.get(DEMO_MERCHANT_COOKIE)?.value;

  if (cv === 'akami' || cv === 'afen') {
    const m = getMerchantFromCookie(cv);
    return { tenantId: m.tenantId, slug: m.slug };
  }
  if (cv && /^[0-9a-f-]{36}$/i.test(cv)) {
    const [m] = await dbAdmin
      .select({ id: merchants.id, slug: merchants.slug })
      .from(merchants)
      .where(eq(merchants.id, cv))
      .limit(1);
    if (m) return { tenantId: m.id, slug: m.slug };
  }
  return null;
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await resolveTenant();
  if (!tenant) notFound();

  const [row] = await withTenantTx(tenant.tenantId, async (tx) => {
    return await tx.select().from(products).where(eq(products.id, id)).limit(1);
  });

  if (!row) {
    // Fallback: 萬一是 demo 還沒 build 過真實 product, 顯示 fixture
    const fixtureRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/fixtures/products/teacup.json`,
    );
    const fixture = await fixtureRes.json();
    return (
      <ProductDetailLayout
        product={fixture}
        productId={id}
        isPublished={false}
        slug={tenant.slug}
        ownedByCurrentTenant={false}
        notice="這是範例資料 — 上傳一張商品照後會看到真實 AI 結果"
      />
    );
  }

  const uiProduct = aiOutputToUi(row.aiMetadata);
  return (
    <ProductDetailLayout
      product={uiProduct}
      productId={id}
      isPublished={row.isPublished}
      slug={tenant.slug}
      ownedByCurrentTenant
    />
  );
}

function ProductDetailLayout({
  product,
  productId,
  isPublished,
  slug,
  ownedByCurrentTenant,
  notice,
}: {
  product: UiProductOutput;
  productId: string;
  isPublished: boolean;
  slug: string;
  ownedByCurrentTenant: boolean;
  notice?: string;
}) {
  return (
    <main className="min-h-screen px-12 py-8" style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <div className="mx-auto max-w-6xl space-y-10">
        {notice && (
          <div
            className="border p-4 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, var(--warning) 32%, transparent)',
              backgroundColor: 'color-mix(in srgb, var(--warning) 8%, transparent)',
              color: 'var(--brand-text)',
              borderRadius: 'var(--brand-radius)',
            }}
          >
            {notice}
          </div>
        )}

        <ProductHeader
          title={product.title}
          status={isPublished ? 'published' : 'draft'}
          productId={productId}
        />

        {ownedByCurrentTenant && (
          <div className="flex items-center justify-between gap-4 rounded-md border p-4"
               style={{
                 borderColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
                 backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
                 borderRadius: 'var(--brand-radius)',
               }}>
            <div>
              <p className="t-caption" style={{ color: 'var(--brand-primary)' }}>
                上架狀態
              </p>
              <p className="t-small mt-1 opacity-70">
                {isPublished
                  ? `顧客已可在 /store/${slug}/products/${productId.slice(0, 8)} 看到並下單`
                  : '草稿中, 顧客在 storefront 看不到'}
              </p>
            </div>
            <PublishToggle
              productId={productId}
              initialPublished={isPublished}
              storefrontSlug={slug}
            />
          </div>
        )}

        <div className="grid grid-cols-3 gap-10">
          <div className="col-span-2 space-y-10">
            <ProductDescription text={product.description} />
            <TagsChips tags={product.seo_tags} />
            <VariantsTable variants={product.variants} />
            <ShopeeExportTab product={product} />
          </div>
          <aside>
            <PriceCard min={product.price_twd.min} max={product.price_twd.max} confidence={product.confidence} />
          </aside>
        </div>
      </div>
    </main>
  );
}
