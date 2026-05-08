/**
 * MerchantCard — platform homepage marketplace storefront card (V1 #58)
 * Linear-tone: dense, sharp, thin border, emoji + name + brand voice in one line + product count + GMV
 *
 * V1.9 T2:
 *   - H: 4px brand-color stripe at top (uses m.themeVars['--brand-primary'],
 *        falls back to --platform-accent so 5 fallback rows still feel branded)
 *   - Hover: shadow-md + -translate-y-0.5 (lift)
 *   - "brand voice not yet set" placeholder not italic (CJK italic looks broken)
 *   - GMV row: bigger weight + var(--brand-text) instead of zinc-700
 *   - Emoji 3xl, slug pill smaller mono caption
 */
import Link from 'next/link';
import type { FeaturedMerchant } from '@/lib/platform/featured-merchants';

export function MerchantCard({
  m,
  showGmv = true,
}: {
  m: FeaturedMerchant;
  showGmv?: boolean;
}) {
  const tagline = m.brandVoice ? m.brandVoice.slice(0, 30) : null;
  const stripeColor = m.themeVars?.['--brand-primary'] ?? 'var(--platform-accent)';

  return (
    <Link
      href={`/store/${m.slug}`}
      className="group block overflow-hidden rounded border bg-white transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderColor: 'var(--border-hairline)' }}
    >
      {/* H: 4px brand color stripe — merchant identity peek even before hover */}
      <div
        className="h-1 w-full"
        style={{ backgroundColor: stripeColor }}
        aria-hidden="true"
      />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-3xl leading-none">{m.emoji ?? '🏪'}</div>
          <span
            className="font-mono text-[11px] tracking-wider"
            style={{ color: 'var(--ink-faint)' }}
          >
            /{m.slug}
          </span>
        </div>
        <h3
          className="mt-3 truncate text-base font-semibold tracking-tight"
          style={{ color: 'var(--brand-text)' }}
        >
          {m.name}
        </h3>
        {tagline ? (
          <p
            className="mt-1 line-clamp-2 text-xs"
            style={{ color: 'var(--ink-muted)' }}
          >
            {tagline}
          </p>
        ) : (
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>
            — 尚未設定品牌語氣 —
          </p>
        )}
        <div
          className="mt-4 flex items-center justify-between text-xs"
          style={{ color: 'var(--ink-muted)' }}
        >
          <span className="tabular-nums">{m.productCount} 件商品</span>
          {showGmv && m.gmvCents > 0 ? (
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: 'var(--brand-text)' }}
            >
              NT$ {(m.gmvCents / 100).toLocaleString()}
            </span>
          ) : (
            <span style={{ color: 'var(--ink-faint)' }}>—</span>
          )}
        </div>
      </div>
    </Link>
  );
}
