'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ShoppingCart, Plus, Minus, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/lib/cart';
import type { ProductAiMetadata } from '@/db/schema';

export function CustomerProductView({
  slug,
  productId,
  title,
  description,
  r2Key,
  priceCents,
  aiMetadata,
}: {
  slug: string;
  productId: string;
  title: string;
  description: string;
  r2Key: string;
  priceCents: number;
  aiMetadata: ProductAiMetadata;
}) {
  const router = useRouter();
  const cart = useCart(slug);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const hasImg = r2Key && !r2Key.includes('/fixtures/');

  const handleAdd = () => {
    cart.addToCart(
      { productId, title, unitPriceCents: priceCents },
      qty,
    );
    setAdded(true);
    toast.success(`加入購物車 (${qty})`, { duration: 1800 });
    setTimeout(() => setAdded(false), 1500);
  };

  const handleBuyNow = () => {
    cart.addToCart(
      { productId, title, unitPriceCents: priceCents },
      qty,
    );
    router.push(`/store/${slug}/cart`);
  };

  return (
    <main
      className="min-h-screen px-6 py-10 md:px-12"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2">
        {/* 左: 商品圖 */}
        <div
          className="aspect-square overflow-hidden"
          style={{ borderRadius: 'var(--brand-radius)', boxShadow: 'var(--elev-2)' }}
        >
          {hasImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/uploads/${r2Key}`} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full items-center justify-center"
              style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 6%, transparent)' }}
            >
              <ShoppingCart className="h-16 w-16 opacity-30" style={{ color: 'var(--brand-primary)' }} />
            </div>
          )}
        </div>

        {/* 右: 商品資訊 + CTA */}
        <div className="flex flex-col">
          <h1
            className="t-h1 mb-4 break-words"
            style={{ fontFamily: 'var(--brand-font-heading)' }}
          >
            {title}
          </h1>

          <p
            className="t-tabular mb-6 text-3xl font-semibold"
            style={{ color: 'var(--brand-primary)' }}
          >
            NT$ {(priceCents / 100).toLocaleString()}
          </p>

          {aiMetadata.seo_tags && aiMetadata.seo_tags.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {aiMetadata.seo_tags.map((t) => (
                <Badge
                  key={t}
                  variant="outline"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                    color: 'var(--brand-primary)',
                    borderRadius: 'var(--brand-radius)',
                  }}
                >
                  #{t}
                </Badge>
              ))}
            </div>
          )}

          <div className="prose prose-sm mb-8 max-w-none whitespace-pre-line leading-loose"
               style={{ color: 'color-mix(in srgb, var(--brand-text) 78%, transparent)' }}>
            {description}
          </div>

          {/* Quantity selector */}
          <div className="mb-6 flex items-center gap-4">
            <span className="t-caption" style={{ color: 'var(--brand-primary)' }}>
              數量
            </span>
            <div
              className="inline-flex items-center overflow-hidden border"
              style={{
                borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                borderRadius: 'var(--brand-radius)',
              }}
            >
              <button
                type="button"
                className="px-3 py-2 transition-colors hover:bg-brand-soft"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="減少"
              >
                <Minus className="h-4 w-4" strokeWidth={2.4} />
              </button>
              <span className="min-w-10 text-center font-semibold tabular-nums">{qty}</span>
              <button
                type="button"
                className="px-3 py-2 transition-colors hover:bg-brand-soft"
                onClick={() => setQty((q) => Math.min(99, q + 1))}
                aria-label="增加"
              >
                <Plus className="h-4 w-4" strokeWidth={2.4} />
              </button>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={handleAdd}
              variant="outline"
              size="lg"
              className="hover-lift flex-1 gap-2 py-6"
              style={{
                borderColor: 'var(--brand-primary)',
                color: 'var(--brand-primary)',
                borderRadius: 'var(--brand-radius)',
              }}
            >
              <motion.span
                animate={added ? { rotate: 360 } : { rotate: 0 }}
                transition={{ duration: 0.4 }}
                className="inline-block"
              >
                {added ? <Check className="h-4 w-4" strokeWidth={2.6} /> : <ShoppingCart className="h-4 w-4" strokeWidth={2.4} />}
              </motion.span>
              {added ? '已加入購物車' : '加入購物車'}
            </Button>
            <Button
              onClick={handleBuyNow}
              size="lg"
              className="hover-lift flex-1 gap-2 py-6 text-base font-semibold elev-2"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: 'var(--brand-bg)',
                borderRadius: 'var(--brand-radius)',
                fontFamily: 'var(--brand-font-heading)',
              }}
            >
              立即購買 →
            </Button>
          </div>

          <p className="t-caption mt-6 opacity-50">
            · 金流整合中 (綠界 / TapPay) — 目前訂單會記入商家後台供對帳, 暫不扣款
          </p>
        </div>
      </div>
    </main>
  );
}
