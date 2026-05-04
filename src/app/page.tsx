/**
 * Catalogify 平台首頁 — marketplace 入口 (V1 #58, RA5)
 *
 * Linear-tone: 黑白 + Inter + sharp 4px radius (PlatformShell wrapper)
 * 不繼承商家 brand vars
 *
 * V1.9 T2:
 *   - F: Wordmark replaces rotated-zinc-square in hero kicker + footer
 *   - J: Tagline rewrite — full-width punctuation, no slashes
 *   - L: Stat strip 變大 (mt-6, text-2xl numerals) + 5-emoji merchant peek
 *   - G: Footer hairline uses --platform-accent for 柿色 signature
 *
 * 結構:
 *   1. Hero: wordmark kicker + tagline + stat strip + 2 CTA + emoji peek
 *   2. 熱門店鋪 — 6 張 (GMV desc, fallback createdAt desc)
 *   3. 新進駐 — 近 7 天 (空狀態 hide section)
 *   4. Footer: 關於 / 隱私 / 條款 + Wordmark 小尺寸
 */
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { MerchantCard } from '@/components/platform/MerchantCard';
import { Wordmark } from '@/components/platform/Wordmark';
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
        <section
          className="border-b pb-16 md:pb-20"
          style={{ borderColor: 'var(--platform-accent-edge)' }}
        >
          <div
            className="flex items-center gap-3 font-mono text-xs uppercase tracking-wider"
            style={{ color: 'var(--ink-muted)' }}
          >
            <Wordmark size="md" />
            <span style={{ color: 'var(--ink-faint)' }}>·</span>
            <span>多商家自由進駐</span>
          </div>

          <h1
            className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl md:leading-tight"
            style={{ color: 'var(--brand-text)' }}
          >
            為獨立小店蓋的電商平台
          </h1>
          <p
            className="mt-4 max-w-2xl text-base md:text-lg"
            style={{ color: 'var(--ink-muted)' }}
          >
            拍一張照,60 秒上架;不切後台,不開 Excel — 把時間還給做產品的人。
          </p>

          {/* L: stat strip — 變大, ABOVE CTAs */}
          {stats.merchantCount > 0 && (
            <div
              className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm"
              style={{ color: 'var(--brand-text)' }}
            >
              <span>
                <span className="text-2xl font-semibold tabular-nums">
                  {stats.merchantCount}
                </span>{' '}
                家獨立小店
              </span>
              <span style={{ color: 'var(--ink-faint)' }}>/</span>
              <span>
                <span className="text-2xl font-semibold tabular-nums">
                  {stats.productCount}
                </span>{' '}
                件商品
              </span>
              <span style={{ color: 'var(--ink-faint)' }}>/</span>
              <span>
                <span className="text-2xl font-semibold tabular-nums">60s</span>{' '}
                AI 上架
              </span>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#featured"
              className="inline-flex items-center gap-1.5 rounded px-5 py-2.5 text-sm font-medium transition"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: 'var(--brand-bg)',
              }}
            >
              逛逛獨立店家
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
            </a>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 rounded border bg-transparent px-5 py-2.5 text-sm font-medium transition"
              style={{
                borderColor: 'var(--border-hairline)',
                color: 'var(--brand-text)',
              }}
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
              我要開店
            </Link>
          </div>

          {/* L: 5-emoji merchant peek */}
          {featured.length > 0 && (
            <div className="mt-10 flex items-center gap-2">
              <span
                className="font-mono text-xs uppercase tracking-wider"
                style={{ color: 'var(--ink-faint)' }}
              >
                已進駐
              </span>
              <div className="flex -space-x-1">
                {featured.slice(0, 5).map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 text-lg shadow-sm"
                    style={{
                      borderColor: 'var(--brand-bg)',
                      backgroundColor: 'var(--bg-card)',
                    }}
                  >
                    {m.emoji ?? '🏪'}
                  </span>
                ))}
              </div>
              <a
                href="#featured"
                className="text-xs hover:underline"
                style={{ color: 'var(--ink-muted)' }}
              >
                看全部 →
              </a>
            </div>
          )}
        </section>

        {/* 熱門店鋪 */}
        <section id="featured" className="py-12 md:py-16">
          <div className="flex items-baseline justify-between">
            <h2
              className="text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--brand-text)' }}
            >
              熱門店鋪
            </h2>
            <span
              className="font-mono text-xs uppercase tracking-wider"
              style={{ color: 'var(--ink-faint)' }}
            >
              {featured.length > 0 ? `top ${featured.length}` : ''}
            </span>
          </div>

          {featured.length === 0 ? (
            <p
              className="mt-8 rounded border border-dashed p-12 text-center text-sm"
              style={{
                borderColor: 'var(--border-hairline)',
                color: 'var(--ink-muted)',
              }}
            >
              平台還沒有商家 —{' '}
              <Link
                href="/onboarding"
                className="font-medium underline"
                style={{ color: 'var(--brand-text)' }}
              >
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
          <section
            className="border-t py-12 md:py-16"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            <div className="flex items-baseline justify-between">
              <h2
                className="text-2xl font-semibold tracking-tight"
                style={{ color: 'var(--brand-text)' }}
              >
                新進駐
              </h2>
              <span
                className="font-mono text-xs uppercase tracking-wider"
                style={{ color: 'var(--ink-faint)' }}
              >
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
        <footer
          className="border-t pt-10 pb-4"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-4 text-xs"
            style={{ color: 'var(--ink-muted)' }}
          >
            <div className="flex items-center gap-4">
              <Link href="/about" className="hover:underline">
                關於 Catalogify
              </Link>
              <Link href="/privacy" className="hover:underline">
                隱私權
              </Link>
              <Link href="/terms" className="hover:underline">
                服務條款
              </Link>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <Wordmark size="sm" />
              <span style={{ color: 'var(--ink-faint)' }}>·</span>
              <span>多商家自由進駐 · 2026</span>
            </div>
          </div>
        </footer>
      </div>
    </PlatformShell>
  );
}
