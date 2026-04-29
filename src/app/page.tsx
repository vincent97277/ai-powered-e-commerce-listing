/**
 * 根目錄首頁 — Hackathon demo 階段直接導去商家後台
 * Visual: hero moment with display typography, gradient bg, staggered fade-in
 */
'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Zap } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0 },
};

const stagger = {
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-brand-vignette noise-bg">
      {/* 背景裝飾 — 大圓暈 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[600px] w-[1100px] -translate-x-1/2 opacity-50 blur-3xl"
        style={{
          background:
            'radial-gradient(ellipse at center, color-mix(in srgb, var(--brand-primary) 22%, transparent) 0%, transparent 60%)',
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-20 text-center">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="space-y-10"
        >
          {/* Eyebrow chip */}
          <motion.div variants={fadeUp} className="flex justify-center">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium tracking-wide backdrop-blur-sm"
              style={{
                borderColor:
                  'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                backgroundColor:
                  'color-mix(in srgb, var(--brand-primary) 6%, var(--brand-bg))',
                color: 'var(--brand-primary)',
              }}
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
              Catalogify · AI 商品上架機器
            </span>
          </motion.div>

          {/* Display heading */}
          <motion.h1
            variants={fadeUp}
            className="t-display mx-auto max-w-3xl"
            style={{ color: 'var(--brand-text)' }}
          >
            一張照片
            <span className="mx-2 inline-block align-middle">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{
                  background: 'var(--brand-primary)',
                  boxShadow:
                    '0 0 24px color-mix(in srgb, var(--brand-primary) 60%, transparent)',
                }}
              />
            </span>
            <span style={{ color: 'var(--brand-primary)' }}>七件事</span>
            <br />
            六十秒上架
          </motion.h1>

          {/* Subhead */}
          <motion.p
            variants={fadeUp}
            className="t-body mx-auto max-w-2xl text-lg opacity-75"
          >
            標題 · 描述 · SEO 標籤 · 去背圖 · 變體 · 建議定價 · 蝦皮規格
            <br />
            <span className="opacity-60">
              一次到位，免再切換十個工具。
            </span>
          </motion.p>

          {/* CTA group */}
          <motion.div
            variants={fadeUp}
            className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row"
          >
            <Link
              href="/merchant/products/new"
              className="hover-lift group inline-flex items-center gap-2 px-8 py-4 text-base font-semibold elev-2"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: 'var(--brand-bg)',
                borderRadius: 'var(--brand-radius)',
                fontFamily: 'var(--brand-font-heading)',
              }}
            >
              立即試上架
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                strokeWidth={2.4}
              />
            </Link>

            <Link
              href="/store/akami"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium hover:bg-brand-soft"
              style={{
                color: 'var(--brand-primary)',
                borderRadius: 'var(--brand-radius)',
                border:
                  '1px solid color-mix(in srgb, var(--brand-primary) 24%, transparent)',
              }}
            >
              查看 storefront 範例
            </Link>
          </motion.div>

          {/* Trust indicator */}
          <motion.div
            variants={fadeUp}
            className="flex items-center justify-center gap-6 pt-8 text-xs opacity-60"
          >
            <span className="inline-flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" strokeWidth={2.2} />
              powered by GPT-4o vision
            </span>
            <span className="h-3 w-px bg-current opacity-30" />
            <span>平均 60 秒完成</span>
            <span className="h-3 w-px bg-current opacity-30" />
            <span>支援多商家</span>
          </motion.div>
        </motion.div>

        {/* Footer logo strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="absolute bottom-8 flex items-center gap-3 text-xs opacity-40"
        >
          <span
            className="inline-block h-1 w-1 rounded-full"
            style={{ background: 'var(--brand-primary)' }}
          />
          <span className="tracking-widest uppercase">
            Hackathon Demo · 2026
          </span>
          <span
            className="inline-block h-1 w-1 rounded-full"
            style={{ background: 'var(--brand-primary)' }}
          />
        </motion.div>
      </div>
    </main>
  );
}
