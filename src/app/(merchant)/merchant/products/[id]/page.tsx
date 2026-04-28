'use client';

import { use, useEffect, useState } from 'react';
import { ProductHeader } from '@/components/products/ProductHeader';
import { ProductDescription } from '@/components/products/ProductDescription';
import { TagsChips } from '@/components/products/TagsChips';
import { VariantsTable } from '@/components/products/VariantsTable';
import { PriceCard } from '@/components/products/PriceCard';
import { ShopeeExportTab } from '@/components/products/ShopeeExportTab';
import type { ProductOutput } from '@/lib/types';

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<ProductOutput | null>(null);

  useEffect(() => {
    // Hackathon: 一律先抓 fixture，真 API 是 /api/products/{id}
    fetch('/fixtures/products/teacup.json').then((r) => r.json()).then(setProduct);
  }, [id]);

  if (!product) return <div className="p-12 opacity-50">載入中…</div>;

  return (
    <main className="min-h-screen px-12 py-8" style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <div className="mx-auto max-w-6xl space-y-10">
        <ProductHeader title={product.title} status="draft" productId={id} />
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
