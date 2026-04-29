/**
 * Catalogify 平台首頁 — marketplace 入口 (V1 #58, RA5)
 *
 * Linear-tone: 黑白 + Inter + sharp 4px radius (PlatformShell wrapper)
 * 不繼承商家 brand vars
 *
 * 結構:
 *   1. Hero: 品牌 + tagline + 2 CTA (逛逛 | 開店)
 *   2. 熱門店鋪 — 6 張 (GMV desc, fallback createdAt desc)
 *   3. 新進駐 — 近 7 天 (空狀態 hide section)
 *   4. Footer: 關於 / 隱私 / 條款 + monospace 版本號
 */
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { MerchantCard } from '@/components/platform/MerchantCard';
import {
  getFeaturedMerchants,
  getRecentMerchants,
  getPlatformStats,
} from '@/lib/platform/featured-merchants';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [featured, recent, stats] = await Promise.all([
    getFeaturedMerchants(6),
    getRecentMerchants(6),
    getPlatformStats(),
  ]);

  return (
    <PlatformShell className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-12 md:px-10 md:py-20">
        {/* Hero */}
        <section className="border-b border-zinc-200 pb-16 md:pb-20">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-zinc-500">
            <span className="inline-block h-2.5 w-2.5 rotate-45 bg-zinc-900" />
            <span>Catalogify · 多商家自由進駐</span>
          </div>

          <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-900 md:text-5xl md:leading-tight">
            為獨立小店蓋的電商平台
          </h1>
          <p className="mt-4 max-w-2xl text-base text-zinc-600 md:text-lg">
            一張照片, AI 60 秒幫你寫好商品文案 / SEO 標籤 / 蝦皮上架 CSV. 上架完, 直接接顧客。
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#featured"
              className="inline-flex items-center gap-1.5 rounded bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-50 transition hover:bg-zinc-800"
            >
              逛逛獨立店家
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
            </a>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 rounded border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
              我要開店
            </Link>
          </div>

          {/* mini stats */}
          {stats.merchantCount > 0 && (
            <p className="mt-8 text-xs text-zinc-500">
              <span className="tabular-nums font-medium text-zinc-700">
                {stats.merchantCount}
              </span>{' '}
              家商家 ·{' '}
              <span className="tabular-nums font-medium text-zinc-700">
                {stats.productCount}
              </span>{' '}
              件商品
            </p>
          )}
        </section>

        {/* 熱門店鋪 */}
        <section id="featured" className="py-12 md:py-16">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">熱門店鋪</h2>
            <span className="font-mono text-xs uppercase tracking-wider text-zinc-400">
              {featured.length > 0 ? `top ${featured.length}` : ''}
            </span>
          </div>

          {featured.length === 0 ? (
            <p className="mt-8 rounded border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500">
              平台還沒有商家 —{' '}
              <Link href="/onboarding" className="font-medium text-zinc-900 underline">
                成為第一家
              </Link>
            </p>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((m) => (
                <MerchantCard key={m.id} m={m} />
              ))}
            </div>
          )}
        </section>

        {/* 新進駐 (空狀態 hide) */}
        {recent.length > 0 && (
          <section className="border-t border-zinc-200 py-12 md:py-16">
            <div className="flex items-baseline justify-between">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
                新進駐
              </h2>
              <span className="font-mono text-xs uppercase tracking-wider text-zinc-400">
                last 7 days
              </span>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((m) => (
                <MerchantCard key={m.id} m={m} showGmv={false} />
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="border-t border-zinc-200 pt-10 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-500">
            <div className="flex items-center gap-4">
              <Link href="/about" className="hover:text-zinc-900 hover:underline">
                關於 Catalogify
              </Link>
              <Link href="/privacy" className="hover:text-zinc-900 hover:underline">
                隱私權
              </Link>
              <Link href="/terms" className="hover:text-zinc-900 hover:underline">
                服務條款
              </Link>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <span className="inline-block h-1 w-1 bg-zinc-900" />
              <span>Catalogify · 多商家自由進駐 · 2026</span>
            </div>
          </div>
        </footer>
      </div>
    </PlatformShell>
  );
}
