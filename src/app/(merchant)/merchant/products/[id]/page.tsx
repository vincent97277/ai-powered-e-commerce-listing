/**
 * 商家商品詳情頁 (server component) — 從 DB 撈真實商品資料
 * 透過 RLS 確保只看得到自己的商品
 */
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products, merchants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ProductHeader } from '@/components/products/ProductHeader';
import { ProductDescription } from '@/components/products/ProductDescription';
import { TagsChips } from '@/components/products/TagsChips';
import { VariantsTable } from '@/components/products/VariantsTable';
import { PriceCard } from '@/components/products/PriceCard';
import { ShopeeExportTab } from '@/components/products/ShopeeExportTab';
import { PublishToggle } from '@/components/products/PublishToggle';
import { EditableProductFields } from '@/components/products/EditableProductFields';
import { DeleteProductButton } from '@/components/products/DeleteProductButton';
import { StatusChip } from '@/components/ui/StatusChip';
import { aiOutputToUi } from '@/lib/ai/flatten';
import type { ProductOutput as UiProductOutput } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await cookies();
  const tenant = await resolveMerchantFromCookie(c.get('demo-merchant-id')?.value);

  // 不是 UUID 直接 404
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

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

  // 撈 merchant 的 lowStockThreshold for stock indicator
  const [merchantRow] = await withTenantTx(tenant.tenantId, async (tx) => {
    return await tx
      .select({ lowStockThreshold: merchants.lowStockThreshold })
      .from(merchants)
      .where(eq(merchants.id, tenant.tenantId))
      .limit(1);
  });
  const lowStockThreshold = merchantRow?.lowStockThreshold ?? 5;

  const uiProduct = aiOutputToUi(row.aiMetadata);
  // 用 DB 真實 title/description/price (商家可能編輯過)
  uiProduct.title = row.title;
  uiProduct.description = row.description;
  uiProduct.price_twd = {
    min: Math.round(row.priceCents / 100),
    max: Math.round(row.priceCents / 100),
  };
  return (
    <ProductDetailLayout
      product={uiProduct}
      productId={id}
      isPublished={row.isPublished}
      priceCents={row.priceCents}
      stockQuantity={row.stockQuantity}
      lowStockThreshold={lowStockThreshold}
      slug={tenant.slug}
      ownedByCurrentTenant
    />
  );
}

function ProductDetailLayout({
  product,
  productId,
  isPublished,
  priceCents,
  stockQuantity,
  lowStockThreshold,
  slug,
  ownedByCurrentTenant,
  notice,
}: {
  product: UiProductOutput;
  productId: string;
  isPublished: boolean;
  priceCents?: number;
  stockQuantity?: number;
  lowStockThreshold?: number;
  slug: string;
  ownedByCurrentTenant: boolean;
  notice?: string;
}) {
  const stockChip =
    ownedByCurrentTenant && stockQuantity !== undefined
      ? stockQuantity === 0
        ? { tone: 'error' as const, label: '缺貨' }
        : stockQuantity <= (lowStockThreshold ?? 5)
          ? { tone: 'warning' as const, label: `低庫存 ${stockQuantity}` }
          : { tone: 'neutral' as const, label: `庫存 ${stockQuantity}` }
      : null;
  return (
    <main className="min-h-screen px-12 py-8" style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <div className="mx-auto max-w-6xl space-y-8">
        {/* 返回列表 */}
        <Link
          href="/merchant/products"
          className="inline-flex items-center gap-1 text-sm hover:opacity-80"
          style={{ color: 'var(--brand-primary)' }}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
          回商品列表
        </Link>

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
                  ? `顧客已可在 /store/${slug} 看到並下單`
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
            {ownedByCurrentTenant && priceCents !== undefined && (
              <EditableProductFields
                productId={productId}
                initialTitle={product.title}
                initialDescription={product.description}
                initialPriceCents={priceCents}
                initialStockQuantity={stockQuantity ?? 0}
              />
            )}
            <ProductDescription text={product.description} />
            <TagsChips tags={product.seo_tags} />
            <VariantsTable variants={product.variants} />
            <ShopeeExportTab product={product} />
          </div>
          <aside className="space-y-4">
            <PriceCard min={product.price_twd.min} max={product.price_twd.max} confidence={product.confidence} />
            {stockChip && (
              <div className="flex items-center justify-between gap-3 border p-4"
                   style={{
                     borderColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
                     backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
                     borderRadius: 'var(--brand-radius)',
                   }}>
                <p className="t-caption" style={{ color: 'var(--brand-primary)' }}>
                  目前庫存
                </p>
                <StatusChip tone={stockChip.tone} label={stockChip.label} size="md" />
              </div>
            )}
          </aside>
        </div>

        {ownedByCurrentTenant && (
          <div
            className="flex justify-end border-t pt-6"
            style={{ borderColor: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)' }}
          >
            <DeleteProductButton productId={productId} title={product.title} />
          </div>
        )}
      </div>
    </main>
  );
}
