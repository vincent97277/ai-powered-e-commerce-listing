'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { motion, AnimatePresence } from 'framer-motion';

export function StorefrontHeader({ slug, merchantName }: { slug: string; merchantName: string }) {
  const { totalQuantity } = useCart(slug);

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between border-b px-6 py-4 backdrop-blur-sm md:px-12"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--brand-bg) 90%, transparent)',
        borderColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
      }}
    >
      <Link
        href={`/store/${slug}`}
        className="t-h3 hover:opacity-80"
        style={{ fontFamily: 'var(--brand-font-heading)', color: 'var(--brand-primary)' }}
      >
        {merchantName}
      </Link>

      <Link
        href={`/store/${slug}/cart`}
        className="relative inline-flex items-center gap-2 rounded-md border px-4 py-2 transition-colors hover:bg-brand-soft"
        style={{
          borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
          borderRadius: 'var(--brand-radius)',
          color: 'var(--brand-primary)',
        }}
      >
        <ShoppingCart className="h-4 w-4" strokeWidth={2.2} />
        <span className="text-sm">購物車</span>
        <AnimatePresence>
          {totalQuantity > 0 && (
            <motion.span
              key={totalQuantity}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: 'var(--brand-bg)',
              }}
            >
              {totalQuantity}
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
    </header>
  );
}
