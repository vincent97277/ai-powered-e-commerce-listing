'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Compass } from 'lucide-react';

const QUIPS = [
  '這頁面好像跑去拍商品了。',
  'AI 也找不到這頁。',
  '404 — 但你的好奇心 +1。',
];

export default function NotFound() {
  const quip = QUIPS[Math.floor(Math.random() * QUIPS.length)];
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-12 text-center"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <motion.div
        animate={{ y: [0, -12, 0], rotate: [-3, 3, -3] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Compass size={64} strokeWidth={1.4} style={{ color: 'var(--brand-primary)' }} />
      </motion.div>
      <h1 className="text-5xl" style={{ fontFamily: 'var(--brand-font-heading)' }}>
        404
      </h1>
      <p className="max-w-md text-lg opacity-70">{quip}</p>
      <Link
        href="/merchant/products/new"
        className="rounded-md border px-5 py-2 text-sm transition-colors hover:bg-[color-mix(in_srgb,var(--brand-primary)_10%,transparent)]"
        style={{
          borderColor: 'var(--brand-primary)',
          color: 'var(--brand-primary)',
          borderRadius: 'var(--brand-radius)',
        }}
      >
        回去拍下一張商品 →
      </Link>
    </main>
  );
}
